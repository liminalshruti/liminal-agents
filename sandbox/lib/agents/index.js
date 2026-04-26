import { architect } from "./architect.js";
import { witness } from "./witness.js";
import { contrarian } from "./contrarian.js";

export const AGENTS = [architect, witness, contrarian];
export const AGENT_KEYS = ["architect", "witness", "contrarian"];
export { architect, witness, contrarian };

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
