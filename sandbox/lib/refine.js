// Bounded re-read: invoke a single agent again with extra user-provided
// context. Closes the third architectural weakness from the post-OSS4AI
// teardown (one-shot agents, no replanning) without violating the
// bounded-multi-agent claim.
//
// Architectural choice: refinement is INTRA-agent, not inter-agent.
//
//   - The user picks ONE agent and ONE refinement input.
//   - That agent re-reads with the original synthesis + the refinement.
//   - Other agents are NOT consulted. The disagreement architecture is
//     preserved.
//   - The refined interpretation is stored as a refined_views row linked
//     to the original agent_view. The original is NOT overwritten — the
//     audit trail keeps both.
//
// This is the formalized correction-stream-as-input shape. Where /api/correction
// records pushback for the moat, /api/refine actually runs the agent again
// with the pushback baked in. The user gets a second pass without the
// architecture giving up its single-shot bounded property at the agent
// fanout level.

import { runAgent, AGENTS, OPUS_MODEL } from "./agents/index.js";
import { openDb, newId } from "./db.js";

export async function refineAgentRead({
  client,
  readingId,
  agentKey,
  refinement,
  parentRefinedId = null,
  model = OPUS_MODEL,
}) {
  if (!readingId) throw new Error("refineAgentRead: readingId required");
  if (!agentKey) throw new Error("refineAgentRead: agentKey required");
  if (typeof refinement !== "string" || !refinement.trim()) {
    throw new Error("refineAgentRead: refinement must be a non-empty string");
  }

  const agent = AGENTS.find((a) => a.key === agentKey);
  if (!agent) throw new Error(`refineAgentRead: unknown agent_key "${agentKey}"`);

  const db = openDb();
  const reading = db.prepare(`SELECT * FROM readings WHERE id = ?`).get(readingId);
  if (!reading) throw new Error(`refineAgentRead: reading not found: ${readingId}`);

  // Compose the input: original signal_summary + threads (the agent's
  // original `state` + `context`) + the user's refinement appended.
  const stateForAgent = reading.signal_summary || "";
  let threads = [];
  try {
    threads = JSON.parse(reading.threads);
  } catch (e) {
    console.warn(`[refineAgentRead ${readingId}] threads parse failed: ${e.message}`);
  }

  // If a prior refined_views row is the parent, fetch its interpretation
  // so the agent can see its own previous answer (this is the only place
  // where an agent ever sees prior agent output — and it's its OWN, not
  // another agent's).
  let priorOwnInterpretation = "";
  if (parentRefinedId) {
    const parent = db
      .prepare(`SELECT interpretation, agent_key FROM refined_views WHERE id = ?`)
      .get(parentRefinedId);
    if (!parent) {
      throw new Error(`refineAgentRead: parent refined_view not found: ${parentRefinedId}`);
    }
    if (parent.agent_key !== agentKey) {
      throw new Error(
        `refineAgentRead: parent refinement is from agent "${parent.agent_key}", ` +
        `not "${agentKey}". Refinement must continue the same agent's chain.`,
      );
    }
    priorOwnInterpretation = parent.interpretation;
  } else {
    // Look up the original agent_view from the canonical reading.
    const originalView = db
      .prepare(`SELECT interpretation FROM agent_views WHERE reading_id = ? AND agent_key = ?`)
      .get(readingId, agentKey);
    priorOwnInterpretation = originalView?.interpretation || "";
  }

  const contextLines = threads
    .map((t, i) => `Thread ${i + 1}: ${t.label} — ${t.summary}`)
    .filter(Boolean);
  if (priorOwnInterpretation) {
    contextLines.push("");
    contextLines.push(`Your previous read: ${priorOwnInterpretation}`);
  }
  contextLines.push("");
  contextLines.push(`User refinement: ${refinement.trim()}`);
  contextLines.push("Read again. Stay in lane. If your previous read was wrong, name it.");

  const contextForAgent = contextLines.join("\n");

  const result = await runAgent(client, agent, stateForAgent, contextForAgent, model);

  // Store the refined view. Preserve the original agent_views row.
  const refinedId = newId();
  db.prepare(
    `INSERT INTO refined_views (id, reading_id, agent_key, refinement_input, interpretation, timestamp, parent_refined_id)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    refinedId,
    readingId,
    agentKey,
    refinement.trim(),
    result.interpretation,
    Date.now(),
    parentRefinedId,
  );

  return {
    refined_id: refinedId,
    reading_id: readingId,
    agent_key: agentKey,
    parent_refined_id: parentRefinedId,
    interpretation: result.interpretation,
    classification: result.classification,
    tool_turns: result.tool_turns,
    timestamp: Date.now(),
  };
}

// Returns the chain of refinements for a (reading, agent), oldest first.
// Empty array if no refinements have happened.
export function getRefinementChain(readingId, agentKey) {
  const db = openDb();
  return db
    .prepare(
      `SELECT id, refinement_input, interpretation, timestamp, parent_refined_id
       FROM refined_views
       WHERE reading_id = ? AND agent_key = ?
       ORDER BY timestamp ASC`,
    )
    .all(readingId, agentKey);
}
