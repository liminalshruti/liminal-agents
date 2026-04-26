#!/usr/bin/env node
/**
 * /agency orchestrator — three bounded agents respond to a single B2B task.
 *
 * The in-lane agent produces work. The others refuse and name the correct
 * agent. Refusal is a designed output, not an error (PPA #4).
 *
 * Usage:
 *   node skills/agency/run.js "<task description>"
 *
 * Writes:
 *   - 1 signal_event (source='user-task', kind='agency-request', register='operational')
 *   - 1 deliberation row (trigger='check', signal_ids=[that signal])
 *   - 3 agent reads stored in analyst_view / sdr_view / auditor_view JSON columns
 *
 * Returns JSON with vault_id and the three reads + per-agent refused flag.
 */

import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import { runAllAgents } from "../../lib/agents/index.js";
import { makeClientOrExit } from "../../lib/anthropic-client.js";

const taskRaw = process.argv.slice(2).join(" ").trim();
if (!taskRaw) {
  console.error("ERROR: missing task. Example: run.js \"teardown of cofeld.com\"");
  process.exit(1);
}

const db = openVault();
const now = Date.now();

// Record the task as a signal so it shows up in /history
const signalId = newId();
db.prepare(
  `INSERT INTO signal_events (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
   VALUES (?, ?, 'user-task', 'agency-request', 'operational', NULL, ?, 1, 'native')`,
).run(signalId, now, JSON.stringify({ task: taskRaw }));

// Open a deliberation row up front so we can store the in-flight signal_id
const deliberationId = newId();
db.prepare(
  `INSERT INTO deliberations (id, timestamp, trigger, signal_ids, user_state, user_context,
     architect_view, witness_view, contrarian_view, schema_version, vault_origin)
   VALUES (?, ?, 'check', ?, ?, NULL, NULL, NULL, NULL, 1, 'native')`,
).run(
  deliberationId,
  now,
  JSON.stringify([signalId]),
  taskRaw,
);

try {
  const { client, mode } = makeClientOrExit();
  const byName = await runAllAgents(client, taskRaw, null);

  const analystText = byName["Analyst"] || "";
  const sdrText = byName["SDR"] || "";
  const auditorText = byName["Auditor"] || "";

  // Store outputs in the existing columns (kept for backward-compat with PR #4 schema).
  // The legacy column names map: architect_view = analyst, witness_view = sdr, contrarian_view = auditor.
  db.prepare(
    `UPDATE deliberations SET architect_view = ?, witness_view = ?, contrarian_view = ? WHERE id = ?`,
  ).run(analystText, sdrText, auditorText, deliberationId);

  console.log(
    JSON.stringify(
      {
        vault_id: deliberationId,
        signal_id: signalId,
        task: taskRaw,
        anthropic_mode: mode,
        analyst: { interpretation: analystText, refused: detectRefusal(analystText) },
        sdr: { interpretation: sdrText, refused: detectRefusal(sdrText) },
        auditor: { interpretation: auditorText, refused: detectRefusal(auditorText) },
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("ERROR calling agent backend:", err.message);
  process.exit(1);
} finally {
  db.close();
}

/**
 * Lightweight refusal heuristic: an agent has refused if it explicitly
 * names another agent's lane in a refusal-shaped sentence. Each agent's
 * system prompt instructs them to refuse with phrasing like
 *   "That's the SDR's lane. I do the research; the SDR runs the move."
 * so we look for the name+lane pattern. Heuristic only — not a hard
 * gate. The TUI uses this to color the refusal pane differently.
 */
function detectRefusal(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const lanePatterns = [
    /that['']s the (analyst|sdr|auditor)['']?s? lane/,
    /the (analyst|sdr|auditor) (does|runs|judges|owns)/,
    /that['']s (an? )?(analyst|sdr|auditor)['']?s? (call|job|work)/,
  ];
  return lanePatterns.some((re) => re.test(t));
}
