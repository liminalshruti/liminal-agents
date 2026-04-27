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

// Twelve agency-flavored agents in four registers.
// Order is canonical and must not be reordered casually — vault rows and the
// orchestrator response shape both depend on it.
export const AGENTS = [
  analyst, researcher, forensic,
  sdr, closer, liaison,
  auditor, strategist, skeptic,
  operator, scheduler, bookkeeper,
];

export const AGENT_KEYS = AGENTS.map((a) => a.key);

export const REGISTERS = ["Diligence", "Outreach", "Judgment", "Operations"];

export function agentsByRegister() {
  const out = { Diligence: [], Outreach: [], Judgment: [], Operations: [] };
  for (const a of AGENTS) out[a.register].push(a);
  return out;
}

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
