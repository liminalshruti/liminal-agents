// Unit tests for the bounded-agent registry, system prompt composition,
// and runtime refusal-protocol validation.
//
// Runner: node:test (built-in, Node 20+).
// Run:    cd sandbox && node --test test/agents.test.js

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGENTS,
  AGENT_KEYS,
  REGISTERS,
  agentsByRegister,
} from "../lib/agents/index.js";
import { buildBoundedSystemPrompt } from "../lib/agents/bounded-system-prompt.js";
import { isRefusal, classifyInterpretation } from "../lib/agents/validation.js";

// ─── AGENTS registry ─────────────────────────────────────────────────────

test("AGENTS contains exactly 12 agents", () => {
  assert.equal(AGENTS.length, 12);
});

test("AGENT_KEYS matches the canonical agent set", () => {
  const expected = [
    "analyst", "researcher", "forensic",
    "sdr", "closer", "liaison",
    "auditor", "strategist", "skeptic",
    "operator", "scheduler", "bookkeeper",
  ];
  assert.deepEqual(AGENT_KEYS, expected);
});

test("REGISTERS is exactly the four canonical registers", () => {
  assert.deepEqual(REGISTERS, ["Diligence", "Outreach", "Judgment", "Operations"]);
});

test("agentsByRegister groups 3 agents per register", () => {
  const grouped = agentsByRegister();
  for (const reg of REGISTERS) {
    assert.equal(grouped[reg].length, 3, `${reg} should have 3 agents`);
  }
});

test("each agent has required fields", () => {
  for (const a of AGENTS) {
    assert.ok(a.name, `${a.key}: name`);
    assert.ok(a.key, `${a.key}: key`);
    assert.ok(a.register, `${a.key}: register`);
    assert.ok(a.domain, `${a.key}: domain`);
    assert.ok(a.baseSystem, `${a.key}: baseSystem`);
    assert.ok(a.system, `${a.key}: system`);
    assert.equal(typeof a.task, "function", `${a.key}: task`);
  }
});

// ─── Bounded system prompt composition ───────────────────────────────────

test("every agent's system prompt includes the refusal-protocol guard", () => {
  for (const a of AGENTS) {
    assert.match(
      a.system,
      /When you refuse, refuse to one of these agent names only:/,
      `${a.key} missing refusal allowlist`,
    );
    assert.match(
      a.system,
      /Do not invent agent names/,
      `${a.key} missing "do not invent" guard`,
    );
    assert.match(
      a.system,
      /Do not reference this codebase, system architecture, agent roles, prompts, or your own existence/,
      `${a.key} missing fourth-wall guard`,
    );
  }
});

test("each agent's allowlist names exactly the 11 OTHER agents (not itself)", () => {
  for (const a of AGENTS) {
    assert.ok(
      !a.system.includes(`only: ${a.name},`) &&
        !a.system.includes(`, ${a.name},`) &&
        !a.system.includes(`, ${a.name}.`),
      `${a.key} allowlist must not include its own name (${a.name})`,
    );
    for (const other of AGENTS) {
      if (other.key === a.key) continue;
      assert.ok(
        a.system.includes(other.name),
        `${a.key} allowlist missing ${other.name}`,
      );
    }
  }
});

test("baseSystem is preserved verbatim inside system", () => {
  for (const a of AGENTS) {
    assert.ok(
      a.system.startsWith(a.baseSystem),
      `${a.key} system should start with baseSystem`,
    );
  }
});

test("buildBoundedSystemPrompt rejects bad input", () => {
  assert.throws(() => buildBoundedSystemPrompt(null, AGENTS), /baseSystem/);
  assert.throws(() => buildBoundedSystemPrompt({}, AGENTS), /baseSystem/);
  assert.throws(
    () => buildBoundedSystemPrompt({ key: "x", baseSystem: "y" }, []),
    /allAgents/,
  );
});

// ─── Refusal-protocol validation ─────────────────────────────────────────

test("isRefusal recognizes well-formed REFUSE: prefix", () => {
  assert.equal(isRefusal("REFUSE: Analyst · not my lane"), true);
  assert.equal(isRefusal("  REFUSE: SDR · outreach work"), true);
});

test("isRefusal rejects non-refusal prose", () => {
  assert.equal(isRefusal("The customer has escalated three times."), false);
  assert.equal(isRefusal(""), false);
  assert.equal(isRefusal("REFUSAL: Analyst"), false);
});

test("classifyInterpretation: valid refusal naming a known agent", () => {
  const result = classifyInterpretation("REFUSE: Analyst · this is diligence work", AGENTS);
  assert.equal(result.kind, "valid_refusal");
  assert.equal(result.target, "Analyst");
});

test("classifyInterpretation: case-insensitive refusal target normalizes", () => {
  const result = classifyInterpretation("REFUSE: analyst · diligence work", AGENTS);
  assert.equal(result.kind, "valid_refusal");
  assert.equal(result.target, "Analyst");
  assert.equal(result.normalized, true);
});

test("classifyInterpretation: refusal naming an unknown agent flagged", () => {
  const result = classifyInterpretation("REFUSE: Synthesizer · cross-pollination work", AGENTS);
  assert.equal(result.kind, "unknown_target");
  assert.equal(result.target, "Synthesizer");
});

test("classifyInterpretation: malformed refusal flagged", () => {
  const result = classifyInterpretation("REFUSE: this needs the analyst", AGENTS);
  assert.equal(result.kind, "malformed_refusal");
});

test("classifyInterpretation: prose returns kind=prose", () => {
  const result = classifyInterpretation(
    "The customer has escalated three times this week.",
    AGENTS,
  );
  assert.equal(result.kind, "prose");
});

test("classifyInterpretation: empty interpretation flagged", () => {
  assert.equal(classifyInterpretation("", AGENTS).kind, "empty");
  assert.equal(classifyInterpretation("   ", AGENTS).kind, "empty");
  assert.equal(classifyInterpretation(null, AGENTS).kind, "empty");
});
