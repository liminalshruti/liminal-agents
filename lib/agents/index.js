/**
 * Agent registry — two bounded sets sharing one substrate.
 *
 * INTROSPECTIVE_AGENTS (12 agents in 4 registers)
 *   The original Liminal substrate, expanded from 3 to 12 agents on
 *   2026-04-27. Reads user state across:
 *
 *     Structural — Architect, Strategist, Economist
 *     Somatic    — Witness, Physician, Child
 *     Temporal   — Historian, Cartographer, Elder
 *     Symbolic   — Contrarian, Mystic, Betrayer
 *
 *   Used by /check (q1/q2/q3 state deliberation) and /close (end-of-day
 *   synthesis). Anchors PPA #4 (Bounded Refusal Architecture) on
 *   archetypal domain boundaries.
 *
 * AGENCY_AGENTS (Analyst / SDR / Auditor)
 *   The B2B founder-ops surface introduced for the AgentHansa AI Agent
 *   Economy Hackathon (Apr 25). Same bounded-refusal substrate, mapped
 *   onto specialist worker personas at agency price-points. Used by
 *   /agency. The fuller 12-agent agency surface lives in sandbox/ for
 *   the OSS4AI build.
 *
 * Both sets share the REFUSAL PROTOCOL (first line "REFUSE: <agent>" when
 * out of lane) so the orchestrator's prefix-check detector works for either.
 *
 * The two sets are not interchangeable. Calling /check with the agency set
 * returns SDR voice on introspective queries — wrong tone, wrong category.
 * Pass the right set to runAllAgents explicitly via the `agents` parameter.
 */

import { architect } from "./architect.js";
import { strategist } from "./strategist.js";
import { economist } from "./economist.js";
import { witness } from "./witness.js";
import { physician } from "./physician.js";
import { child } from "./child.js";
import { historian } from "./historian.js";
import { cartographer } from "./cartographer.js";
import { elder } from "./elder.js";
import { contrarian } from "./contrarian.js";
import { mystic } from "./mystic.js";
import { betrayer } from "./betrayer.js";
import { analyst } from "./analyst.js";
import { sdr } from "./sdr.js";
import { auditor } from "./auditor.js";

import { buildBoundedSystemPrompt } from "./bounded-system-prompt.js";
import { classifyInterpretation } from "./validation.js";

// ─── Introspective set — 12 agents, fixed canonical order ─────────────────
// Order matters: it determines the order of agent_views rows in the vault
// (agents are inserted in order). Reordering breaks existing readings.
const INTROSPECTIVE_DEFS = [
  architect, strategist, economist,
  witness, physician, child,
  historian, cartographer, elder,
  contrarian, mystic, betrayer,
];

// Compose final agents: each gets a `system` property built from its
// hand-tuned `baseSystem` + auto-generated allowlist of the OTHER 11
// agent names + fourth-wall guard. Single source of truth for refusal
// protocol — see bounded-system-prompt.js.
export const INTROSPECTIVE_AGENTS = INTROSPECTIVE_DEFS.map((agent) => ({
  ...agent,
  system: buildBoundedSystemPrompt(agent, INTROSPECTIVE_DEFS),
}));

export const INTROSPECTIVE_AGENT_NAMES = INTROSPECTIVE_AGENTS.map((a) => a.name);

export const INTROSPECTIVE_REGISTERS = ["Structural", "Somatic", "Temporal", "Symbolic"];

export function introspectiveByRegister() {
  const out = { Structural: [], Somatic: [], Temporal: [], Symbolic: [] };
  for (const a of INTROSPECTIVE_AGENTS) out[a.register].push(a);
  return out;
}

// ─── Agency set — 3 agents (the AgentHansa surface) ───────────────────────
// The fuller 12-agent agency surface lives in sandbox/lib/agents/ for
// OSS4AI. These 3 remain for the existing /agency skill in main.
// Note: the agency 3 keep their pre-helper system prompts (each defines
// its own refusal protocol inline). They have NOT been refactored to
// the baseSystem + helper pattern because that would change the live
// /agency skill's behavior. Future work.
export const AGENCY_AGENTS = [analyst, sdr, auditor];
export const AGENCY_AGENT_NAMES = ["Analyst", "SDR", "Auditor"];

// ─── Default export ───────────────────────────────────────────────────────
// Defaults to the introspective set — the thesis-anchoring substrate.
// Callers that want the agency set must pass it explicitly.
export const AGENTS = INTROSPECTIVE_AGENTS;
export const AGENT_NAMES = INTROSPECTIVE_AGENT_NAMES;

export {
  architect, strategist, economist,
  witness, physician, child,
  historian, cartographer, elder,
  contrarian, mystic, betrayer,
  analyst, sdr, auditor,
};

export const OPUS_MODEL = "claude-opus-4-7";

// ─── runAgent ─────────────────────────────────────────────────────────────
// Throws on empty content (so allSettled in runAllAgents can capture it).
// Logs malformed-refusal / unknown-target classifications via console.warn
// without rejecting — keeps the reading running on prompt drift.
export async function runAgent(client, agent, state, context, model = OPUS_MODEL) {
  const response = await client.messages.create({
    model,
    max_tokens: 600,
    temperature: 1.0,
    system: agent.system,
    messages: [{ role: "user", content: agent.task(state, context) }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const text = (textBlock?.text || "").trim();

  if (!text) {
    throw new Error(
      `agent ${agent.name}: no text in API response ` +
      `(stop_reason=${response.stop_reason || "unknown"}, ` +
      `content_blocks=${response.content?.length ?? 0})`,
    );
  }

  // Classify against whatever set the agent belongs to. Try introspective
  // first; if no name match, try agency. Drift logged via console.warn.
  let allAgents = INTROSPECTIVE_AGENTS;
  if (!allAgents.find((a) => a.name === agent.name)) {
    allAgents = AGENCY_AGENTS;
  }
  const classification = classifyInterpretation(text, allAgents);
  if (classification.kind === "malformed_refusal") {
    console.warn(`[runAgent ${agent.name}] malformed refusal: ${classification.reason}`);
  } else if (classification.kind === "unknown_target") {
    console.warn(
      `[runAgent ${agent.name}] refusal names unknown agent "${classification.target}"`,
    );
  }

  return {
    name: agent.name,
    register: agent.register || null,
    interpretation: text,
    classification: classification.kind,
  };
}

/**
 * Run a set of agents in parallel against the same state + context.
 *
 * Returns { byName, errors }:
 *   byName  — map of agent name → { name, register, interpretation, classification }
 *             For failed agents, byName[name] is { ..., interpretation: "", error: true, error_reason }.
 *   errors  — array of { agent_name, reason } for failed agents.
 *
 * Uses Promise.allSettled (not Promise.all) so a single agent failure does
 * not lose the other 11's work. Mirrors the partial-result error model
 * proven in sandbox/lib/agents/index.js.
 *
 * Back-compat: the old signature returned { [name]: interpretation } directly.
 * Callers using the old shape need to read result.byName instead. See
 * skills/check/orchestrator.js for the migration.
 *
 * @param {object}   client   Anthropic client.
 * @param {string}   state    User state text.
 * @param {string?}  context  Optional context.
 * @param {object?}  opts
 * @param {Array}    opts.agents  Agent set. Defaults to AGENTS (introspective).
 * @param {string}   opts.model   Model. Defaults to OPUS_MODEL.
 */
export async function runAllAgents(client, state, context, opts = {}) {
  if (typeof opts === "string") {
    opts = { model: opts };
  }
  const agents = opts.agents || AGENTS;
  const model = opts.model || OPUS_MODEL;

  const results = await Promise.allSettled(
    agents.map((a) => runAgent(client, a, state, context, model)),
  );

  const byName = {};
  const errors = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const agent = agents[i];

    if (result.status === "fulfilled") {
      byName[agent.name] = result.value;
    } else {
      const reason = result.reason?.message || String(result.reason);
      errors.push({ agent_name: agent.name, reason });
      byName[agent.name] = {
        name: agent.name,
        register: agent.register || null,
        interpretation: "",
        error: true,
        error_reason: reason,
      };
      console.error(`[runAllAgents] ${agent.name} failed: ${reason}`);
    }
  }

  return { byName, errors };
}
