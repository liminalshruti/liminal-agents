// Runtime validation of the bounded-refusal protocol.
//
// Agents are instructed to respond either with normal in-lane prose, OR
// with a refusal in the exact format:
//
//   REFUSE: <AgentName> · <one-sentence boundary>
//
// where <AgentName> is the canonical Name of one of the other 11 agents.
//
// We validate the shape at runtime — not to reject (don't break the demo
// on prompt drift) but to log + surface issues. DB-level CHECK on
// agent_views.agent_key is the second layer of defense.

const REFUSAL_PREFIX = "REFUSE:";

// Matches: "REFUSE: <AgentName> · <reason>"
// AgentName is one or more whitespace-separated word tokens.
// Separator is the middle-dot character (·, U+00B7).
const REFUSAL_REGEX = /^REFUSE:\s+([A-Za-z][\w\s]*?)\s+·\s+\S.*$/;

export function isRefusal(interpretation) {
  if (typeof interpretation !== "string") return false;
  return interpretation.trimStart().startsWith(REFUSAL_PREFIX);
}

// Returns one of:
//   { kind: "prose" }                        — non-refusal output (regular agent work)
//   { kind: "valid_refusal", target: "..." } — well-formed refusal naming a known agent
//   { kind: "malformed_refusal", reason }    — starts with REFUSE: but doesn't match shape
//   { kind: "unknown_target", target: "..." } — well-formed shape but names a non-existent agent
//   { kind: "empty" }                        — empty / whitespace-only output
export function classifyInterpretation(interpretation, allAgents) {
  if (!interpretation || !interpretation.trim()) {
    return { kind: "empty" };
  }

  const text = interpretation.trim();

  if (!isRefusal(text)) {
    return { kind: "prose" };
  }

  const match = text.match(REFUSAL_REGEX);
  if (!match) {
    return {
      kind: "malformed_refusal",
      reason: "expected `REFUSE: <AgentName> · <one-sentence boundary>`",
    };
  }

  const target = match[1].trim();
  const knownNames = new Set(allAgents.map((a) => a.name));
  if (!knownNames.has(target)) {
    // Allow case-insensitive match (the model occasionally lowercases),
    // but flag for telemetry.
    const ci = allAgents.find((a) => a.name.toLowerCase() === target.toLowerCase());
    if (ci) {
      return { kind: "valid_refusal", target: ci.name, normalized: true };
    }
    return { kind: "unknown_target", target };
  }

  return { kind: "valid_refusal", target };
}
