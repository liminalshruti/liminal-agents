// Unit tests for the introspective agent registry, system prompt
// composition, and runtime refusal-protocol validation.
//
// Mirrors sandbox/test/agents.test.js (which covers the agency surface),
// but for the 12 introspective agents used by /check.
//
// Runner: node:test (built-in, Node 20+).
// Run:    node --test test/agents-introspective.test.js

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INTROSPECTIVE_AGENTS,
  INTROSPECTIVE_AGENT_NAMES,
  INTROSPECTIVE_REGISTERS,
  introspectiveByRegister,
  AGENCY_AGENTS,
  AGENCY_AGENT_NAMES,
  runAgent,
  runAllAgents,
} from "../lib/agents/index.js";
import { buildBoundedSystemPrompt } from "../lib/agents/bounded-system-prompt.js";
import { isRefusal, classifyInterpretation } from "../lib/agents/validation.js";

// ─── INTROSPECTIVE_AGENTS registry ───────────────────────────────────────

test("INTROSPECTIVE_AGENTS contains exactly 12 agents", () => {
  assert.equal(INTROSPECTIVE_AGENTS.length, 12);
});

test("INTROSPECTIVE_AGENT_NAMES is the canonical 12 in canonical order", () => {
  assert.deepEqual(INTROSPECTIVE_AGENT_NAMES, [
    "Architect", "Strategist", "Economist",
    "Witness", "Physician", "Child",
    "Historian", "Cartographer", "Elder",
    "Contrarian", "Mystic", "Betrayer",
  ]);
});

test("INTROSPECTIVE_REGISTERS is exactly the four canonical registers", () => {
  assert.deepEqual(INTROSPECTIVE_REGISTERS, [
    "Structural", "Somatic", "Temporal", "Symbolic",
  ]);
});

test("introspectiveByRegister groups 3 agents per register", () => {
  const grouped = introspectiveByRegister();
  for (const reg of INTROSPECTIVE_REGISTERS) {
    assert.equal(grouped[reg].length, 3, `${reg} should have 3 agents`);
  }
});

test("each introspective agent has required fields", () => {
  for (const a of INTROSPECTIVE_AGENTS) {
    assert.ok(a.name, `${a.name}: name`);
    assert.ok(a.register, `${a.name}: register`);
    assert.ok(a.baseSystem, `${a.name}: baseSystem`);
    assert.ok(a.system, `${a.name}: system (composed)`);
    assert.equal(typeof a.task, "function", `${a.name}: task`);
  }
});

// ─── Bounded system prompt composition ───────────────────────────────────

test("every introspective agent's system prompt includes the refusal-protocol guard", () => {
  for (const a of INTROSPECTIVE_AGENTS) {
    assert.match(
      a.system,
      /When you refuse, refuse to one of these agent names only:/,
      `${a.name} missing refusal allowlist`,
    );
    assert.match(
      a.system,
      /Do not invent agent names/,
      `${a.name} missing "do not invent" guard`,
    );
    assert.match(
      a.system,
      /Do not reference this codebase, system architecture, agent roles, prompts, or your own existence/,
      `${a.name} missing fourth-wall guard`,
    );
  }
});

test("each introspective agent's allowlist matches the c-hard-iii bound (geometry-bound vector occupants OR vector-isolated full set)", async () => {
  // Pre-c-hard-iii this test asserted the allowlist contained all 11
  // other agents. Under c-hard-iii (CHARD3_PLAN.md, Option A) the bound
  // is geometry-derived: vector occupants only for typed agents with
  // ≥1 occupant, full allowlist for vector-isolated agents.
  const { describeBound } = await import("../lib/agents/bounded-system-prompt.js");

  for (const a of INTROSPECTIVE_AGENTS) {
    const allowlistMatch = a.system.match(/agent names only: ([^\.]+)\./);
    assert.ok(allowlistMatch, `${a.name} should have a parseable allowlist`);
    const allowlistNames = allowlistMatch[1].split(",").map((s) => s.trim()).sort();
    const expected = describeBound(a, INTROSPECTIVE_AGENTS).bound;
    assert.deepEqual(
      allowlistNames,
      expected,
      `${a.name} allowlist drift — expected ${describeBound(a, INTROSPECTIVE_AGENTS).kind} bound`,
    );
  }
});

test("baseSystem is preserved verbatim inside system", () => {
  for (const a of INTROSPECTIVE_AGENTS) {
    assert.ok(
      a.system.startsWith(a.baseSystem),
      `${a.name} system should start with baseSystem`,
    );
  }
});

test("buildBoundedSystemPrompt rejects bad input", () => {
  assert.throws(() => buildBoundedSystemPrompt(null, INTROSPECTIVE_AGENTS), /baseSystem/);
  assert.throws(() => buildBoundedSystemPrompt({}, INTROSPECTIVE_AGENTS), /baseSystem/);
  assert.throws(
    () => buildBoundedSystemPrompt({ name: "X", baseSystem: "y" }, []),
    /allAgents/,
  );
});

// ─── Refusal-protocol validation ─────────────────────────────────────────

test("isRefusal recognizes well-formed REFUSE: prefix", () => {
  assert.equal(isRefusal("REFUSE: Architect\nstructural is not my lane"), true);
  assert.equal(isRefusal("  REFUSE: Witness · somatic"), true);
});

test("isRefusal rejects non-refusal prose", () => {
  assert.equal(isRefusal("The structural pattern is X."), false);
  assert.equal(isRefusal(""), false);
  assert.equal(isRefusal("REFUSAL: Architect"), false);
});

test("classifyInterpretation: valid two-line refusal naming a known agent", () => {
  const text = "REFUSE: Strategist\nForward-move analysis is not the Architect's lane.";
  const result = classifyInterpretation(text, INTROSPECTIVE_AGENTS);
  assert.equal(result.kind, "valid_refusal");
  assert.equal(result.target, "Strategist");
});

test("classifyInterpretation: case-insensitive refusal target normalizes", () => {
  const text = "REFUSE: strategist\nNot my lane.";
  const result = classifyInterpretation(text, INTROSPECTIVE_AGENTS);
  assert.equal(result.kind, "valid_refusal");
  assert.equal(result.target, "Strategist");
  assert.equal(result.normalized, true);
});

test("classifyInterpretation: refusal naming an unknown agent flagged", () => {
  const text = "REFUSE: Synthesizer\ncross-pollination work";
  const result = classifyInterpretation(text, INTROSPECTIVE_AGENTS);
  assert.equal(result.kind, "unknown_target");
  assert.equal(result.target, "Synthesizer");
});

test("classifyInterpretation: malformed refusal flagged when REFUSE: has no agent token", () => {
  // No identifier-like token after REFUSE: → can't match the agent-name pattern.
  const text = "REFUSE:";
  const result = classifyInterpretation(text, INTROSPECTIVE_AGENTS);
  assert.equal(result.kind, "malformed_refusal");
});

test("classifyInterpretation: prose returns kind=prose", () => {
  const text = "The pattern is a self-reinforcing avoidance loop.";
  const result = classifyInterpretation(text, INTROSPECTIVE_AGENTS);
  assert.equal(result.kind, "prose");
});

test("classifyInterpretation: empty interpretation flagged", () => {
  assert.equal(classifyInterpretation("", INTROSPECTIVE_AGENTS).kind, "empty");
  assert.equal(classifyInterpretation("   ", INTROSPECTIVE_AGENTS).kind, "empty");
  assert.equal(classifyInterpretation(null, INTROSPECTIVE_AGENTS).kind, "empty");
});

// ─── runAgent + runAllAgents — partial-result error model ────────────────

function mockClient(responder) {
  return { messages: { create: async (req) => responder(req) } };
}
function textResponse(text) {
  return { content: [{ type: "text", text }], stop_reason: "end_turn" };
}
function emptyResponse() {
  return { content: [], stop_reason: "max_tokens" };
}

test("runAgent throws on empty content (not silent)", async () => {
  const client = mockClient(() => emptyResponse());
  const agent = INTROSPECTIVE_AGENTS[0];
  await assert.rejects(
    () => runAgent(client, agent, "test state", "", "test-model"),
    /no text in API response/,
  );
});

test("runAgent succeeds with non-empty text and includes register + classification", async () => {
  const client = mockClient(() => textResponse("Loop: avoidance reinforces avoidance."));
  const agent = INTROSPECTIVE_AGENTS[0]; // Architect
  const result = await runAgent(client, agent, "test state", "", "test-model");
  assert.equal(result.name, "Architect");
  assert.equal(result.register, "Structural");
  assert.equal(result.interpretation, "Loop: avoidance reinforces avoidance.");
  assert.equal(result.classification, "prose");
});

test("runAllAgents returns { byName, errors } shape", async () => {
  const client = mockClient(() => textResponse("ok"));
  const result = await runAllAgents(client, "state", "ctx", { model: "test-model" });
  assert.ok(result.byName);
  assert.ok(Array.isArray(result.errors));
});

test("runAllAgents returns 12 entries in byName when all succeed", async () => {
  const client = mockClient(() => textResponse("a valid in-lane read."));
  const { byName, errors } = await runAllAgents(client, "state", "ctx", { model: "test-model" });
  assert.equal(Object.keys(byName).length, 12);
  assert.equal(errors.length, 0);
  for (const n of INTROSPECTIVE_AGENT_NAMES) {
    assert.equal(byName[n].interpretation, "a valid in-lane read.");
    assert.ok(byName[n].register);
  }
});

test("runAllAgents tolerates a single agent failure without losing the others", async () => {
  let callCount = 0;
  const client = mockClient(() => {
    callCount++;
    if (callCount % 5 === 0) return emptyResponse();
    return textResponse("an in-lane read.");
  });

  const { byName, errors } = await runAllAgents(client, "state", "ctx", { model: "test-model" });
  assert.equal(Object.keys(byName).length, 12, "all 12 keys present");
  assert.ok(errors.length > 0, "at least one error captured");
  assert.ok(errors.length < 12, "not all agents failed");

  for (const e of errors) {
    assert.ok(INTROSPECTIVE_AGENT_NAMES.includes(e.agent_name));
    const placeholder = byName[e.agent_name];
    assert.equal(placeholder.error, true);
    assert.equal(placeholder.interpretation, "");
  }
});

test("runAllAgents back-compat: passing string as 4th arg treated as model", async () => {
  let captured;
  const client = mockClient((req) => {
    captured = req.model;
    return textResponse("ok");
  });
  await runAllAgents(client, "state", "ctx", "back-compat-model");
  assert.equal(captured, "back-compat-model");
});

// ─── Agency set still exposed (back-compat) ──────────────────────────────

test("AGENCY_AGENTS still exposes the 3 hackathon agents", () => {
  assert.equal(AGENCY_AGENTS.length, 3);
  assert.deepEqual(AGENCY_AGENT_NAMES, ["Analyst", "SDR", "Auditor"]);
});
