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

import Anthropic from "@anthropic-ai/sdk";
import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import { runAllAgents, OPUS_MODEL } from "../../lib/agents/index.js";

const API_KEY =
  process.env.ANTHROPIC_API_KEY ||
  process.env.CLAUDE_PLUGIN_OPTION_ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not set.");
  process.exit(1);
}

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

const client = new Anthropic({ apiKey: API_KEY });

const synthesis = await synthesizeDay(client, signalPayload);
const { signal_summary, threads } = synthesis;

const stateForAgents = signal_summary;
const contextForAgents = threads
  .map((t, i) => `Thread ${i + 1}: ${t.label} — ${t.summary}`)
  .join("\n");

const byName = await runAllAgents(client, stateForAgents, contextForAgents);

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
  byName["Architect"] || null,
  byName["Witness"] || null,
  byName["Contrarian"] || null,
);

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
      architect: { interpretation: byName["Architect"] },
      witness: { interpretation: byName["Witness"] },
      contrarian: { interpretation: byName["Contrarian"] },
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
