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
// where <AgentName> is the canonical Name of one of the other agents.
//
// We validate the shape at runtime — not to reject (don't break /check
// on prompt drift) but to log + surface issues.

const REFUSAL_PREFIX = "REFUSE:";

export function isRefusal(interpretation) {
  if (typeof interpretation !== "string") return false;
  return interpretation.trimStart().startsWith(REFUSAL_PREFIX);
}

// Returns one of:
//   { kind: "prose" }                        — non-refusal output
//   { kind: "valid_refusal", target: "..." } — well-formed refusal naming a known agent
//   { kind: "malformed_refusal", reason }    — starts with REFUSE: but doesn't match shape
//   { kind: "unknown_target", target }       — names a non-existent agent
//   { kind: "empty" }                        — empty / whitespace-only output
export function classifyInterpretation(interpretation, allAgents) {
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

  const target = match[1].trim();
  const knownNames = new Set(allAgents.map((a) => a.name));
  if (!knownNames.has(target)) {
    const ci = allAgents.find((a) => a.name.toLowerCase() === target.toLowerCase());
    if (ci) {
      return { kind: "valid_refusal", target: ci.name, normalized: true };
    }
    return { kind: "unknown_target", target };
  }

  return { kind: "valid_refusal", target };
}
