import { analyst } from "./analyst.js";
import { researcher } from "./researcher.js";
import { forensic } from "./forensic.js";
import { sdr } from "./sdr.js";
import { closer } from "./closer.js";
import { liaison } from "./liaison.js";
import { auditor } from "./auditor.js";
import { strategist } from "./strategist.js";
import { skeptic } from "./skeptic.js";
import { operator } from "./operator.js";
import { scheduler } from "./scheduler.js";
import { bookkeeper } from "./bookkeeper.js";
import { buildBoundedSystemPrompt } from "./bounded-system-prompt.js";

// Twelve agency-flavored agents in four registers, in a fixed canonical order.
// The AGENTS array order determines the order of agent_views rows in the
// database (agents are inserted in order during runReading), so reordering
// breaks existing readings. Also affects API response shape. Do not reorder
// without migrating existing readings.
const AGENT_DEFS = [
  analyst, researcher, forensic,
  sdr, closer, liaison,
  auditor, strategist, skeptic,
  operator, scheduler, bookkeeper,
];

// Compose final agents: each gets a `system` property built from its
// hand-tuned `baseSystem` plus an auto-generated refusal allowlist + fourth-wall
// guard. This is the single source of truth for the bounded-refusal protocol —
// changing the helper updates every agent at once. See bounded-system-prompt.js.
export const AGENTS = AGENT_DEFS.map((agent) => ({
  ...agent,
  system: buildBoundedSystemPrompt(agent, AGENT_DEFS),
}));

export const AGENT_KEYS = AGENTS.map((a) => a.key);

export const REGISTERS = ["Diligence", "Outreach", "Judgment", "Operations"];

export function agentsByRegister() {
  const out = { Diligence: [], Outreach: [], Judgment: [], Operations: [] };
  for (const a of AGENTS) out[a.register].push(a);
  return out;
}

// Re-export individual agents for direct import. Note these are the original
// definitions WITHOUT the composed system prompt — for the runtime-ready
// versions, import from AGENTS or AGENT_KEYS lookup instead.
export {
  analyst, researcher, forensic,
  sdr, closer, liaison,
  auditor, strategist, skeptic,
  operator, scheduler, bookkeeper,
};

export const OPUS_MODEL = "claude-opus-4-7";

export async function runAgent(client, agent, state, context, model = OPUS_MODEL) {
  const response = await client.messages.create({
    model,
    max_tokens: 250,
    temperature: 1.0,
    system: agent.system,
    messages: [{ role: "user", content: agent.task(state, context) }],
  });
  const text = response.content.find((b) => b.type === "text")?.text || "";
  return {
    name: agent.name,
    key: agent.key,
    register: agent.register,
    domain: agent.domain,
    interpretation: text.trim(),
  };
}

export async function runAllAgents(client, state, context, model = OPUS_MODEL) {
  const results = await Promise.all(
    AGENTS.map((a) => runAgent(client, a, state, context, model)),
  );
  const byKey = {};
  for (const r of results) byKey[r.key] = r;
  return byKey;
}
