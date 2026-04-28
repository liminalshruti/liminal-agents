#!/usr/bin/env node
/**
 * /close — end-of-day synthesis + three-agent read over today's signals.
 *
 * Usage:
 *   node skills/close/close.js [--surfacing-id=<uuid>] [--today-ms=<ms>]
 *
 * Reads signal_events since local midnight, asks Opus 4.7 to synthesize
 * the day into a one-paragraph signal and up to three threads, then runs
 * the bounded agents on that synthesis. Writes one deliberation with
 * trigger='close'. If --surfacing-id is provided, marks that surfacing_event
 * accepted and back-references the deliberation.
 *
 * Agents read today's synthesis only. They do not read prior corrections.
 */

import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import { runAllAgents, OPUS_MODEL, INTROSPECTIVE_AGENTS } from "../../lib/agents/index.js";
import { makeClientOrExit } from "../../lib/anthropic-client.js";

const args = parseArgs(process.argv.slice(2));
const nowMs = Number(args["today-ms"]) || Date.now();
const surfacingId = args["surfacing-id"] || null;

const dayStart = new Date(nowMs);
dayStart.setHours(0, 0, 0, 0);
const dayStartMs = dayStart.getTime();

const db = openVault();

const signals = db
  .prepare(
    `SELECT id, timestamp, source, kind, register, thread_id, content
     FROM signal_events
     WHERE timestamp >= ?
     ORDER BY timestamp ASC`,
  )
  .all(dayStartMs);

if (signals.length === 0) {
  console.log(
    JSON.stringify({
      vault_id: null,
      reason: "no_signals_today",
      day_start_ms: dayStartMs,
    }),
  );
  db.close();
  process.exit(0);
}

const signalPayload = signals.map((s) => {
  let content;
  try {
    content = JSON.parse(s.content);
  } catch {
    content = {};
  }
  return {
    id: s.id,
    ts: s.timestamp,
    source: s.source,
    kind: s.kind,
    register: s.register,
    thread_id: s.thread_id,
    summary: summarize(content),
  };
});

const { client } = makeClientOrExit();

const synthesis = await synthesizeDay(client, signalPayload);
const { signal_summary, threads } = synthesis;

const stateForAgents = signal_summary;
const contextForAgents = threads
  .map((t, i) => `Thread ${i + 1}: ${t.label} — ${t.summary}`)
  .join("\n");

// /close is end-of-day synthesis on today's signals — same introspective
// substrate as /check. Pass the full 12-agent set explicitly; legacy
// columns (architect_view / witness_view / contrarian_view) get the 3
// canonical reads, the rest land in agent_views.
//
// runAllAgents returns { byName, errors } per the partial-result contract
// (see lib/agents/index.js). The destructure matters — flat assignment
// would land [object Object] / null pairs in the vault.
const { byName, errors } = await runAllAgents(client, stateForAgents, contextForAgents, {
  agents: INTROSPECTIVE_AGENTS,
});

if (errors.length > 0) {
  console.error(
    `[/close] ${errors.length}/${INTROSPECTIVE_AGENTS.length} agents failed; storing partial deliberation`,
  );
  for (const e of errors) {
    console.error(`  - ${e.agent_name}: ${e.reason}`);
  }
}

const deliberationId = newId();
const now = Date.now();

db.prepare(
  `INSERT INTO deliberations (id, timestamp, trigger, signal_ids, user_state, user_context,
     architect_view, witness_view, contrarian_view, schema_version, vault_origin)
   VALUES (?, ?, 'close', ?, ?, ?, ?, ?, ?, 1, 'native')`,
).run(
  deliberationId,
  now,
  JSON.stringify(signals.map((s) => s.id)),
  signal_summary,
  contextForAgents,
  byName["Architect"]?.interpretation || null,
  byName["Witness"]?.interpretation || null,
  byName["Contrarian"]?.interpretation || null,
);

// Also write all 12 agents to agent_views (normalized) so /close
// and /check store the same shape — addresses C3 partial-normalization.
const insertView = db.prepare(
  `INSERT OR REPLACE INTO agent_views (deliberation_id, agent_name, register, interpretation, schema_version)
   VALUES (?, ?, ?, ?, 1)`,
);
const tx = db.transaction(() => {
  for (const agent of INTROSPECTIVE_AGENTS) {
    const r = byName[agent.name];
    if (r && !r.error && r.interpretation) {
      insertView.run(deliberationId, agent.name, agent.register, r.interpretation);
    }
  }
});
tx();

if (surfacingId) {
  db.prepare(
    `UPDATE surfacing_events
       SET status = 'accepted', deliberation_id = ?
       WHERE id = ? AND status IN ('pending', 'accepted')`,
  ).run(deliberationId, surfacingId);
}

console.log(
  JSON.stringify(
    {
      vault_id: deliberationId,
      surfacing_id: surfacingId,
      signal_count: signals.length,
      signal_summary,
      threads,
      architect: { interpretation: byName["Architect"]?.interpretation || null },
      witness: { interpretation: byName["Witness"]?.interpretation || null },
      contrarian: { interpretation: byName["Contrarian"]?.interpretation || null },
      agent_errors: errors,
    },
    null,
    2,
  ),
);

db.close();

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith("--")) out[a.slice(2)] = "true";
  }
  return out;
}

function summarize(content) {
  if (content.text) return String(content.text).slice(0, 320);
  if (content.subject) return String(content.subject).slice(0, 320);
  if (content.user_state) return String(content.user_state).slice(0, 320);
  return JSON.stringify(content).slice(0, 320);
}

async function synthesizeDay(client, signals) {
  const prompt = `You receive today's signals from a user's local context. Produce a compact synthesis.

Signals:
${JSON.stringify(signals, null, 2)}

Return strict JSON:
{
  "signal_summary": "<one paragraph, 2-4 sentences, plain declarative, no hedging, no self-help framing>",
  "threads": [
    {"label": "<2-5 words>", "signal_ids": ["<id>",...], "summary": "<one sentence>"}
  ]
}

At most three threads. Only include threads grounded in the signals. No prose outside the JSON.`;

  const response = await client.messages.create({
    model: OPUS_MODEL,
    max_tokens: 1000,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });
  const text =
    response.content.find((b) => b.type === "text")?.text?.trim() || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      signal_summary: `${signals.length} signals today; synthesis unavailable.`,
      threads: [],
    };
  }
  try {
    const parsed = JSON.parse(match[0]);
    return {
      signal_summary: parsed.signal_summary || "",
      threads: Array.isArray(parsed.threads) ? parsed.threads.slice(0, 3) : [],
    };
  } catch {
    return {
      signal_summary: `${signals.length} signals today; synthesis unparseable.`,
      threads: [],
    };
  }
}
