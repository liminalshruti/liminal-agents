import { OPUS_MODEL } from "./agents/index.js";

const SYNTH_PROMPT_INSTRUCTIONS = `You receive snapshots a founder dropped from their day: meeting notes, decisions, incidents, hard messages. Produce a compact synthesis.

Voice: short declaratives. No hedging ("perhaps", "may", "it seems", "could be"). No self-help framing. No advice. No questions. No banned words: optimize, transform, journey, breakthrough, unlock, healing, wellness, manifest, flourishing.

Return strict JSON only:
{
  "signal_summary": "<one paragraph, 2-4 sentences, plain declarative>",
  "threads": [
    {"label": "<2-5 words>", "snapshot_ids": ["<id>", ...], "summary": "<one sentence>"}
  ]
}

At most three threads. Only include threads grounded in the snapshots. No prose outside the JSON.`;

export async function synthesizeAcrossSnapshots(client, snapshots, model = OPUS_MODEL) {
  if (!snapshots.length) {
    return { signal_summary: "", threads: [] };
  }
  const compact = snapshots.map((s) => ({
    id: s.id,
    ts: s.timestamp,
    kind: s.kind,
    label: s.label || null,
    text: String(s.text).slice(0, 800),
  }));
  const prompt = `${SYNTH_PROMPT_INSTRUCTIONS}\n\nSnapshots:\n${JSON.stringify(compact, null, 2)}`;
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content.find((b) => b.type === "text")?.text?.trim() || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      signal_summary: `${snapshots.length} snapshots dropped; synthesis unavailable.`,
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
      signal_summary: `${snapshots.length} snapshots dropped; synthesis unparseable.`,
      threads: [],
    };
  }
}
