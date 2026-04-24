/**
 * Haiku-powered thread detection.
 *
 * Groups recent untethered signal_events (thread_id IS NULL) into coherent
 * threads. One Haiku call per tick, cap on signals to bound cost. Failure
 * modes (API down, parse error) leave signals untethered — next tick retries.
 */

import { newId } from "../vault/ids.js";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_SIGNALS_PER_CALL = 50;
const MIN_SIGNALS_TO_RUN = 3;

export async function detectThreads({ db, client, log }) {
  if (!client) return { detected: 0, skipped: "no_client" };

  const rows = db
    .prepare(
      `SELECT id, timestamp, source, kind, register, content
       FROM signal_events
       WHERE thread_id IS NULL
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(MAX_SIGNALS_PER_CALL);

  if (rows.length < MIN_SIGNALS_TO_RUN) {
    return { detected: 0, skipped: "below_min_signals" };
  }

  const payload = rows.map((r) => {
    let content;
    try {
      content = JSON.parse(r.content);
    } catch {
      content = {};
    }
    return {
      id: r.id,
      ts: r.timestamp,
      source: r.source,
      kind: r.kind,
      register: r.register,
      summary: summarize(content),
    };
  });

  const prompt = buildPrompt(payload);

  let text;
  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 800,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    text = response.content.find((b) => b.type === "text")?.text?.trim() || "";
  } catch (err) {
    log?.error?.({ err: err.message }, "thread_detect_api_error");
    return { detected: 0, error: "api" };
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    log?.warn?.({ raw: text.slice(0, 240) }, "thread_detect_parse_error");
    return { detected: 0, error: "parse" };
  }

  const threads = Array.isArray(parsed.threads) ? parsed.threads : [];
  const update = db.prepare(
    `UPDATE signal_events SET thread_id = ? WHERE id = ? AND thread_id IS NULL`,
  );

  let detected = 0;
  const tx = db.transaction(() => {
    for (const t of threads) {
      const tid = newId();
      const ids = Array.isArray(t.signal_ids) ? t.signal_ids : [];
      for (const sid of ids) {
        const r = update.run(tid, sid);
        if (r.changes) detected++;
      }
    }
  });
  tx();

  return { detected, threads: threads.length };
}

function buildPrompt(payload) {
  return `You receive recent signals from a user's local context. Group them into coherent threads. A thread is a set of signals that belong to the same line of thought or work.

Signals:
${JSON.stringify(payload, null, 2)}

Return strict JSON: {"threads":[{"label":"<2-5 words>","signal_ids":["<id>","<id>"]}]}. Unrelated signals may be omitted. No prose outside the JSON.`;
}

function summarize(content) {
  if (content.text) return String(content.text).slice(0, 240);
  if (content.subject) return String(content.subject).slice(0, 240);
  if (content.user_state) return String(content.user_state).slice(0, 240);
  return JSON.stringify(content).slice(0, 240);
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : text;
}
