import { analyst } from "./analyst.js";
import { sdr } from "./sdr.js";
import { auditor } from "./auditor.js";

export const AGENTS = [analyst, sdr, auditor];
export const AGENT_NAMES = ["Analyst", "SDR", "Auditor"];
export { analyst, sdr, auditor };

// Back-compat shims for any caller still importing the old names.
// These were renamed Apr 25 (Architect → Analyst, Witness → SDR, Contrarian → Auditor)
// to map cleanly to the AI Agent Economy Hackathon brief: agents that compete
// on real B2B tasks at agency price-points.
export { analyst as architect, sdr as witness, auditor as contrarian };

export const OPUS_MODEL = "claude-opus-4-7";

export async function runAgent(client, agent, state, context, model = OPUS_MODEL) {
  const response = await client.messages.create({
    model,
    max_tokens: 600,
    temperature: 1.0,
    system: agent.system,
    messages: [{ role: "user", content: agent.task(state, context) }],
  });
  const text = response.content.find((b) => b.type === "text")?.text || "";
  return { name: agent.name, interpretation: text.trim() };
}

// Aliases for back-compat: existing skills (/check, /close) read byName["Architect"]
// etc. The agents were renamed Apr 25 (Analyst/SDR/Auditor) for the AI Agent
// Economy Hackathon brief. We populate both keys so old skills keep working.
const NAME_ALIASES = {
  Analyst: ["Architect"],
  SDR: ["Witness"],
  Auditor: ["Contrarian"],
};

export async function runAllAgents(client, state, context, model = OPUS_MODEL) {
  const results = await Promise.all(
    AGENTS.map((a) => runAgent(client, a, state, context, model)),
  );
  const byName = {};
  for (const r of results) {
    byName[r.name] = r.interpretation;
    for (const alias of NAME_ALIASES[r.name] || []) {
      byName[alias] = r.interpretation;
    }
  }
  return byName;
}
