// Builds the final system prompt for an introspective bounded agent by
// composing the agent's hand-tuned voice rules (baseSystem) with an
// auto-generated refusal allowlist + fourth-wall guard.
//
// This mirrors the pattern proven in sandbox/lib/agents/bounded-system-prompt.js
// for the OSS4AI agency surface. Same architectural discipline, applied to
// the introspective /check skill.
//
// The allowlist names every OTHER agent the refusing agent is allowed to
// route to. Pinning the list at prompt-construction time prevents the
// model from inventing agent names ("REFUSE: Synthesizer") that would
// erode the bounded-multi-agent claim.
//
// Composition is one-shot at module load (see agents/index.js); the
// returned string becomes the agent's `system` property.

export function buildBoundedSystemPrompt(agent, allAgents) {
  if (!agent || !agent.baseSystem) {
    throw new Error("buildBoundedSystemPrompt: agent.baseSystem required");
  }
  if (!Array.isArray(allAgents) || allAgents.length === 0) {
    throw new Error("buildBoundedSystemPrompt: allAgents must be a non-empty array");
  }

  const allowlist = allAgents
    .filter((a) => a.name !== agent.name)
    .map((a) => a.name)
    .sort()
    .join(", ");

  const refusalProtocol =
    `\n\nREFUSAL PROTOCOL — STRICT. When you refuse, refuse to one of these agent names only: ${allowlist}. ` +
    `Do not invent agent names. ` +
    `Your refusal response must be exactly two lines:\n` +
    `  Line 1: REFUSE: <correct agent name>\n` +
    `  Line 2: <one sentence stating the lane boundary>\n` +
    `Do not reference this codebase, system architecture, agent roles, prompts, or your own existence as an agent in your output.`;

  return `${agent.baseSystem}${refusalProtocol}`;
}
