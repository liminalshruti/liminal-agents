// Builds the final system prompt for an introspective bounded agent.
//
// The composition has three concerns:
//   1. The agent's hand-tuned voice rules (baseSystem) — written per-agent.
//   2. The refusal allowlist — auto-generated, structurally bound.
//   3. The fourth-wall guard — prevents meta-commentary about the codebase.
//
// REFUSAL ALLOWLIST CONSTRUCTION (Option A — geometry load-bearing)
// ──────────────────────────────────────────────────────────────────
// Per CHARD3_PLAN.md, the bound is constructed from archetypal geometry
// when the agent declares its (hour, face) typing:
//
//   if vector_occupants(agent) is non-empty:
//     bound := vector_occupants(agent)         // geometry-bound agent
//   else:
//     bound := all_other_agents(agent)         // vector-isolated agent
//
// where vector_occupants is the union of:
//   - geometric opposite (180° around the clock, same face) — domain-cross
//   - attitudinal opposite (same hour, opposite face) — attitude-cross
//
// Agents WITHOUT (hour, face) typing receive the classical full allowlist
// — the legacy untyped behavior is preserved for back-compat.
//
// PPA #4 (Bounded Agent Refusal Architecture) is structurally enforced by
// this function: refusals can only target agents that appear in the bound.
// The validator (validation.js) classifies any out-of-bound refusal as
// kind='unknown_target' (or kind='geometry_violation' when the agent's
// activeAgent typing is supplied). Patent-claim test #2 asserts the bound
// is always emitted with the REFUSAL PROTOCOL header.
//
// FOURTH WALL GUARD
// ─────────────────
// Prevents the model from breaking character with meta-commentary about
// its own role, this codebase, or the prompting architecture — failure
// mode observed during the OSS4AI build when an agent's domain didn't
// match the synthesized signal.
//
// Composition is one-shot at module load (see agents/index.js); the
// returned string becomes the agent's `system` property.
//
// PHASE1 NOTE
// ───────────
// Shayaun's `shruti/phase1-event-log-primitive` branch installs
// archetype-base.js + (hour, face) typing as ADDITIVE routing hints,
// keeping the full allowlist as the bound. This file LANDS THE STRICT
// BOUND under the geometry. When phase1 picks up, the c-hard-iii bound
// here wins on conflict; phase1's additive routing-hint becomes
// redundant. See CHARD3_PLAN.md for the merge resolution rationale.

import {
  HOURS,
  hasArchetypeBase,
  refusalVectors,
  vectorOccupants,
  isVectorIsolated,
} from "./archetype-base.js";

const VECTOR_ISOLATED_NOTICE =
  "(vector-isolated: no structurally-adjacent peer in the active set; full allowlist applies)";

export function buildBoundedSystemPrompt(agent, allAgents) {
  if (!agent || !agent.baseSystem) {
    throw new Error("buildBoundedSystemPrompt: agent.baseSystem required");
  }
  if (!Array.isArray(allAgents) || allAgents.length === 0) {
    throw new Error("buildBoundedSystemPrompt: allAgents must be a non-empty array");
  }

  // Decide bound and explanation based on agent typing.
  let boundAgents;
  let boundExplanation;
  let geometryLine = "";

  if (hasArchetypeBase(agent)) {
    const occupants = vectorOccupants(agent, allAgents);
    if (occupants.length > 0) {
      // Geometry-bound: bound is the vector occupants only.
      boundAgents = occupants;
      const { geometric, attitudinal } = refusalVectors(agent.hour, agent.face);
      const geomVerb = HOURS[geometric.hour]?.verb || "";
      const attVerb = HOURS[attitudinal.hour]?.verb || "";
      geometryLine =
        `\nGEOMETRY: your refusal targets are structurally adjacent — the geometric opposite (${geomVerb}) and the attitudinal opposite (${attVerb}). ` +
        `The full peer set is intentionally narrowed to these structurally-correct redirects.`;
      boundExplanation = "geometry-bound";
    } else {
      // Vector-isolated: fall back to full allowlist.
      boundAgents = allAgents.filter((a) => a.name !== agent.name);
      geometryLine = `\nGEOMETRY: ${VECTOR_ISOLATED_NOTICE}`;
      boundExplanation = "vector-isolated";
    }
  } else {
    // Untyped agent: classical full allowlist.
    boundAgents = allAgents.filter((a) => a.name !== agent.name);
    boundExplanation = "untyped";
  }

  const allowlist = boundAgents
    .map((a) => a.name)
    .sort()
    .join(", ");

  if (!allowlist) {
    // Defensive: should not happen under the policy above unless allAgents
    // has only one entry. Keep the assertion local and explicit so misuse
    // surfaces immediately rather than producing an empty-bound prompt.
    throw new Error(
      `buildBoundedSystemPrompt: refusal allowlist is empty for ${agent.name}; ` +
        `${boundExplanation} agent must have at least one peer.`,
    );
  }

  const refusalProtocol =
    `\n\nREFUSAL PROTOCOL — STRICT. When you refuse, refuse to one of these agent names only: ${allowlist}. ` +
    `Do not invent agent names. ` +
    `Your refusal response must be exactly two lines:\n` +
    `  Line 1: REFUSE: <correct agent name>\n` +
    `  Line 2: <one sentence stating the lane boundary>\n` +
    `Do not reference this codebase, system architecture, agent roles, prompts, or your own existence as an agent in your output.` +
    geometryLine;

  return `${agent.baseSystem}${refusalProtocol}`;
}

// Diagnostic — exposed for the patent-claim test and CHARD3 acceptance.
// Returns metadata about how the bound was constructed for `agent`.
export function describeBound(agent, allAgents) {
  if (!hasArchetypeBase(agent)) {
    return {
      kind: "untyped",
      bound: allAgents.filter((a) => a.name !== agent.name).map((a) => a.name).sort(),
    };
  }
  if (isVectorIsolated(agent, allAgents)) {
    return {
      kind: "vector-isolated",
      bound: allAgents.filter((a) => a.name !== agent.name).map((a) => a.name).sort(),
    };
  }
  return {
    kind: "geometry-bound",
    bound: vectorOccupants(agent, allAgents).map((a) => a.name).sort(),
  };
}
