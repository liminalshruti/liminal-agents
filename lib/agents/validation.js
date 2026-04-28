// Runtime validation of the bounded-refusal protocol for introspective
// agents. Mirror of sandbox/lib/agents/validation.js — same protocol,
// same classifications.
//
// Agents are instructed to respond either with normal in-lane prose, OR
// with a refusal in the exact format:
//
//   REFUSE: <AgentName>
//   <one-sentence boundary>
//
// where <AgentName> is the canonical Name of one of the bound agents.
//
// We validate the shape at runtime — not to reject (don't break /check
// on prompt drift) but to log + surface issues. Strict-failure happens
// at the test layer (test/patent-claims.test.js + test/geometry-binding.
// test.js), not in the runtime path.
//
// CLASSIFICATIONS
// ───────────────
//   { kind: "prose" }                        — non-refusal output
//   { kind: "valid_refusal", target }        — well-formed refusal naming a known agent
//   { kind: "malformed_refusal", reason }    — REFUSE: prefix with no parseable name
//   { kind: "unknown_target", target }       — REFUSE: <name> where <name> is not in `allAgents`
//   { kind: "geometry_violation", target,    — REFUSE: <name> where <name> is in `allAgents`
//     vectors }                                but NOT in activeAgent's vector cells
//                                              (only when opts.activeAgent is provided AND
//                                              the agent has (hour, face) typing AND vector
//                                              occupants are non-empty)
//   { kind: "empty" }                        — empty / whitespace-only output
//
// The geometry_violation kind is the runtime teeth on PPA #4 (Bounded
// Agent Refusal Architecture). It does NOT reject the refusal — runtime
// stays forgiving — but the test suite asserts no geometry_violation
// occurrences in integration runs.

import { hasArchetypeBase, vectorOccupants } from "./archetype-base.js";

const REFUSAL_PREFIX = "REFUSE:";

export function isRefusal(interpretation) {
  if (typeof interpretation !== "string") return false;
  return interpretation.trimStart().startsWith(REFUSAL_PREFIX);
}

export function classifyInterpretation(interpretation, allAgents, opts = {}) {
  if (!interpretation || !interpretation.trim()) {
    return { kind: "empty" };
  }

  const text = interpretation.trim();

  if (!isRefusal(text)) {
    return { kind: "prose" };
  }

  // Match either:
  //   "REFUSE: AgentName\n<reason>"  (two-line)
  //   "REFUSE: AgentName <reason>"   (single-line, with separator)
  const match = text.match(/^REFUSE:\s+([A-Za-z][\w\s]*?)(?:\n|\s+·\s+|$)/);
  if (!match) {
    return {
      kind: "malformed_refusal",
      reason: "expected `REFUSE: <AgentName>` followed by newline or boundary text",
    };
  }

  const targetRaw = match[1].trim();
  const knownByName = new Map(allAgents.map((a) => [a.name, a]));

  let resolvedAgent = knownByName.get(targetRaw);
  let normalized = false;
  if (!resolvedAgent) {
    const ci = allAgents.find((a) => a.name.toLowerCase() === targetRaw.toLowerCase());
    if (ci) {
      resolvedAgent = ci;
      normalized = true;
    }
  }
  if (!resolvedAgent) {
    return { kind: "unknown_target", target: targetRaw };
  }

  // Geometry check — only when caller supplied activeAgent and that agent
  // is typed and has vector occupants.
  const activeAgent = opts.activeAgent;
  if (
    activeAgent &&
    hasArchetypeBase(activeAgent) &&
    activeAgent.name !== resolvedAgent.name
  ) {
    const occupants = vectorOccupants(activeAgent, allAgents);
    if (occupants.length > 0) {
      const isInVectors = occupants.some((a) => a.name === resolvedAgent.name);
      if (!isInVectors) {
        return {
          kind: "geometry_violation",
          target: resolvedAgent.name,
          ...(normalized ? { normalized: true } : {}),
          vector_occupants: occupants.map((a) => a.name).sort(),
          message:
            `${activeAgent.name} refused to ${resolvedAgent.name}, which is in the allowlist but ` +
            `outside the geometric/attitudinal vectors [${occupants.map((a) => a.name).sort().join(", ")}].`,
        };
      }
    }
  }

  return {
    kind: "valid_refusal",
    target: resolvedAgent.name,
    ...(normalized ? { normalized: true } : {}),
  };
}
