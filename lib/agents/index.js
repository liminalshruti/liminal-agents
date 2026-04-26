/**
 * Agent registry — two bounded sets sharing one substrate.
 *
 * INTROSPECTIVE_AGENTS (Architect / Witness / Contrarian)
 *   The original Liminal substrate. Read user state across structural,
 *   somatic, and inversion registers. Used by /check (q1/q2/q3 state
 *   deliberation) and /close (end-of-day synthesis). Anchors PPA #4
 *   (Bounded Refusal Architecture) on archetypal domain boundaries.
 *
 * AGENCY_AGENTS (Analyst / SDR / Auditor)
 *   The B2B founder-ops surface introduced for the AgentHansa AI Agent
 *   Economy Hackathon (Apr 25). Same bounded-refusal substrate, mapped
 *   onto specialist worker personas at agency price-points. Used by
 *   /agency.
 *
 * Both sets share the REFUSAL PROTOCOL (first line "REFUSE: <agent>" when
 * out of lane) so the orchestrator's prefix-check detector works for either.
 *
 * The two sets are not interchangeable. Calling /check with the agency set
 * returns SDR voice on introspective queries — wrong tone, wrong category.
 * Pass the right set to runAllAgents explicitly via the `agents` parameter.
 */

import { architect } from "./architect.js";
import { witness } from "./witness.js";
import { contrarian } from "./contrarian.js";
import { analyst } from "./analyst.js";
import { sdr } from "./sdr.js";
import { auditor } from "./auditor.js";

// Introspective set — original Liminal substrate, used by /check and /close.
export const INTROSPECTIVE_AGENTS = [architect, witness, contrarian];
export const INTROSPECTIVE_AGENT_NAMES = ["Architect", "Witness", "Contrarian"];

// Agency set — B2B founder-ops surface, used by /agency.
export const AGENCY_AGENTS = [analyst, sdr, auditor];
export const AGENCY_AGENT_NAMES = ["Analyst", "SDR", "Auditor"];

// Default export is the introspective set (the original substrate). Callers
// that want the agency set must pass it explicitly. This is intentional —
// the introspective set is the thesis-anchoring substrate; defaulting to
// agency would let new skills accidentally inherit the B2B tone.
export const AGENTS = INTROSPECTIVE_AGENTS;
export const AGENT_NAMES = INTROSPECTIVE_AGENT_NAMES;

export { architect, witness, contrarian, analyst, sdr, auditor };

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

/**
 * Run a set of agents in parallel against the same state + context.
 *
 * @param {object}   client   Anthropic client (SDK or CLI shim).
 * @param {string}   state    User state text.
 * @param {string?}  context  Optional context string.
 * @param {object?}  opts
 * @param {Array}    opts.agents  Agent set to run. Defaults to INTROSPECTIVE_AGENTS.
 * @param {string}   opts.model   Model to use. Defaults to OPUS_MODEL.
 *
 * Back-compat: callers using the old positional signature
 *   runAllAgents(client, state, context, model)
 * still work — the 4th arg is detected as a model string vs. an opts object.
 *
 * @returns {Promise<Object<string, string>>}  Map of agent name → interpretation.
 */
export async function runAllAgents(client, state, context, opts = {}) {
  // Back-compat: if 4th arg is a string, treat as model (old signature).
  if (typeof opts === "string") {
    opts = { model: opts };
  }
  const agents = opts.agents || AGENTS;
  const model = opts.model || OPUS_MODEL;

  const results = await Promise.all(
    agents.map((a) => runAgent(client, a, state, context, model)),
  );
  const byName = {};
  for (const r of results) {
    byName[r.name] = r.interpretation;
  }
  return byName;
}
