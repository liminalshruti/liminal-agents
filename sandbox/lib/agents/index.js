import { analyst } from "./analyst.js";
import { researcher } from "./researcher.js";
import { forensic } from "./forensic.js";
import { sdr } from "./sdr.js";
import { closer } from "./closer.js";
import { liaison } from "./liaison.js";
import { auditor } from "./auditor.js";
import { strategist } from "./strategist.js";
import { skeptic } from "./skeptic.js";
import { operator } from "./operator.js";
import { scheduler } from "./scheduler.js";
import { bookkeeper } from "./bookkeeper.js";
import { buildBoundedSystemPrompt } from "./bounded-system-prompt.js";
import { classifyInterpretation } from "./validation.js";
import { TOOLS } from "../tools/fetch_url.js";

// Twelve agency-flavored agents in four registers, in a fixed canonical order.
// The AGENTS array order determines the order of agent_views rows in the
// database (agents are inserted in order during runReading), so reordering
// breaks existing readings. Also affects API response shape. Do not reorder
// without migrating existing readings.
const AGENT_DEFS = [
  analyst, researcher, forensic,
  sdr, closer, liaison,
  auditor, strategist, skeptic,
  operator, scheduler, bookkeeper,
];

// Compose final agents: each gets a `system` property built from its
// hand-tuned `baseSystem` plus an auto-generated refusal allowlist + fourth-wall
// guard. This is the single source of truth for the bounded-refusal protocol —
// changing the helper updates every agent at once. See bounded-system-prompt.js.
export const AGENTS = AGENT_DEFS.map((agent) => ({
  ...agent,
  system: buildBoundedSystemPrompt(agent, AGENT_DEFS),
}));

export const AGENT_KEYS = AGENTS.map((a) => a.key);

export const REGISTERS = ["Diligence", "Outreach", "Judgment", "Operations"];

export function agentsByRegister() {
  const out = { Diligence: [], Outreach: [], Judgment: [], Operations: [] };
  for (const a of AGENTS) out[a.register].push(a);
  return out;
}

// Re-export individual agents for direct import. Note these are the original
// definitions WITHOUT the composed system prompt — for the runtime-ready
// versions, import from AGENTS or AGENT_KEYS lookup instead.
export {
  analyst, researcher, forensic,
  sdr, closer, liaison,
  auditor, strategist, skeptic,
  operator, scheduler, bookkeeper,
};

export const OPUS_MODEL = "claude-opus-4-7";

// Maximum tool-use iterations. Bounded so a misbehaving agent can't loop
// forever calling fetch_url. After this many turns we force the agent to
// emit a final text response.
const MAX_TOOL_TURNS = 3;

// Build the Anthropic-format tool array for an agent based on its
// declared tool allowlist. Returns undefined if the agent has no tools
// (so we don't pass an empty array to the API, which is wasteful).
function toolsForAgent(agent) {
  if (!Array.isArray(agent.tools) || agent.tools.length === 0) return undefined;
  const schemas = [];
  for (const name of agent.tools) {
    const reg = TOOLS[name];
    if (reg) schemas.push(reg.schema);
  }
  return schemas.length > 0 ? schemas : undefined;
}

// Execute a tool call. Returns a tool_result content block to feed back
// to the model.
async function executeToolCall(toolUse) {
  const tool = TOOLS[toolUse.name];
  if (!tool) {
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify({ ok: false, error: `unknown tool: ${toolUse.name}` }),
      is_error: true,
    };
  }
  try {
    const result = await tool.run(toolUse.input || {});
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify(result),
      is_error: result?.ok === false,
    };
  } catch (e) {
    console.error(`[tool ${toolUse.name}] execution failed: ${e.message}`);
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify({ ok: false, error: e.message }),
      is_error: true,
    };
  }
}

export async function runAgent(client, agent, state, context, model = OPUS_MODEL) {
  const tools = toolsForAgent(agent);
  const baseRequest = {
    model,
    max_tokens: 1024,
    temperature: 1.0,
    system: agent.system,
  };
  if (tools) baseRequest.tools = tools;

  // Conversation grows as the agent calls tools. Starts with the user task.
  const messages = [
    { role: "user", content: agent.task(state, context) },
  ];

  let response;
  let toolTurns = 0;

  while (true) {
    response = await client.messages.create({
      ...baseRequest,
      messages,
    });

    // If the model wants to use a tool, execute and loop.
    if (response.stop_reason === "tool_use" && toolTurns < MAX_TOOL_TURNS) {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      if (toolUseBlocks.length === 0) break; // shouldn't happen but defensive

      // Append the assistant's tool_use message + the tool_result message.
      messages.push({ role: "assistant", content: response.content });
      const toolResults = await Promise.all(
        toolUseBlocks.map((tu) => executeToolCall(tu)),
      );
      messages.push({ role: "user", content: toolResults });
      toolTurns++;
      continue;
    }

    break;
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const text = (textBlock?.text || "").trim();

  // Treat empty content as a runtime error so partial-result handling can
  // surface it. Distinguishes "agent had nothing to say" from "API returned
  // an empty response, possibly content-filtered or tool-only".
  if (!text) {
    throw new Error(
      `agent ${agent.key}: no text in API response ` +
      `(stop_reason=${response.stop_reason || "unknown"}, ` +
      `content_blocks=${response.content?.length ?? 0})`,
    );
  }

  // Runtime classification: if the agent emitted a refusal, validate that
  // it names a known agent and matches the canonical shape. Log on drift
  // but do not reject — keep the demo running.
  const classification = classifyInterpretation(text, AGENTS);
  if (classification.kind === "malformed_refusal") {
    console.warn(`[runAgent ${agent.key}] malformed refusal: ${classification.reason}`);
  } else if (classification.kind === "unknown_target") {
    console.warn(
      `[runAgent ${agent.key}] refusal names unknown agent "${classification.target}"`,
    );
  }

  return {
    name: agent.name,
    key: agent.key,
    register: agent.register,
    domain: agent.domain,
    interpretation: text,
    classification: classification.kind,
    tool_turns: toolTurns,
  };
}

// Returns { byKey, errors }.
//   byKey  — map of agent.key → result for agents that succeeded.
//            For agents that failed, byKey[key] is a placeholder
//            { ..., interpretation: "", error: true, error_reason }.
//   errors — array of { agent_key, reason } for failed agents.
//
// Uses Promise.allSettled instead of Promise.all so a single agent failure
// does not lose the other 11 agents' work. Caller (runReading) can decide
// how much partial data is acceptable.
export async function runAllAgents(client, state, context, model = OPUS_MODEL) {
  const results = await Promise.allSettled(
    AGENTS.map((a) => runAgent(client, a, state, context, model)),
  );

  const byKey = {};
  const errors = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const agent = AGENTS[i];

    if (result.status === "fulfilled") {
      byKey[agent.key] = result.value;
    } else {
      const reason = result.reason?.message || String(result.reason);
      errors.push({ agent_key: agent.key, reason });
      byKey[agent.key] = {
        name: agent.name,
        key: agent.key,
        register: agent.register,
        domain: agent.domain,
        interpretation: "",
        error: true,
        error_reason: reason,
      };
      console.error(`[runAllAgents] ${agent.key} failed: ${reason}`);
    }
  }

  return { byKey, errors };
}
