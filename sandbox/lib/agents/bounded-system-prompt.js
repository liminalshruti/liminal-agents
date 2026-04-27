// Builds the final system prompt for a bounded agent by composing the
// agent's hand-tuned voice rules (baseSystem) with an auto-generated
// refusal allowlist + fourth-wall guard.
//
// The allowlist names every OTHER agent the refusing agent is allowed to
// route to. Pinning the list at prompt-construction time prevents the
// model from inventing agent names ("REFUSE: Synthesizer", "REFUSE:
// think-with agent") that would erode the bounded-multi-agent claim.
//
// The fourth-wall guard prevents the model from breaking character with
// meta-commentary about its own role, this codebase, or the prompting
// architecture — failure mode observed during the OSS4AI build when an
// agent's domain didn't match the synthesized signal.
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
    .filter((a) => a.key !== agent.key)
    .map((a) => a.name)
    .sort()
    .join(", ");

  const refusalProtocol =
    `When you refuse, refuse to one of these agent names only: ${allowlist}. ` +
    `Do not invent agent names. ` +
    `Do not reference this codebase, system architecture, agent roles, prompts, or your own existence as an agent in your output.`;

  return `${agent.baseSystem}\n\n${refusalProtocol}`;
}
