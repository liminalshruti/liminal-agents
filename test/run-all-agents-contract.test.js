// Contract test for runAllAgents — pins the return shape so callers
// (skills/check, skills/agency, skills/close) can rely on it.
//
// History: PR #15 changed the return shape from a flat `{[name]: text}` map
// to `{ byName, errors }` to support partial-result error handling. The
// /check orchestrator was migrated; /agency was missed and silently wrote
// empty strings to the vault on every run until detected on 2026-04-28.
// This test is the trip-wire for that class of drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runAllAgents, AGENCY_AGENTS, INTROSPECTIVE_AGENTS } from "../lib/agents/index.js";

// A minimal stub of the Anthropic client surface that runAllAgents touches.
// Returns deterministic prose so we can assert on shape without API calls.
function makeStubClient(agentTextByName) {
  return {
    messages: {
      create: async ({ system }) => {
        // Recover the agent's name from its system prompt (the canonical
        // identifier we have at this layer). Each agent's baseSystem starts
        // with "You are the <Name>." — extract that.
        const m = system.match(/You are the ([A-Z][\w\s]*?)\./);
        const name = m ? m[1].trim() : "Unknown";
        const text = agentTextByName[name] ?? `${name} stub response`;
        return {
          content: [{ type: "text", text }],
          stop_reason: "end_turn",
        };
      },
    },
  };
}

test("runAllAgents returns { byName, errors } — contract pin (regression for /agency PR #15 silent break)", async () => {
  const client = makeStubClient({
    Analyst: "structural read prose",
    SDR: "outreach draft prose",
    Auditor: "audit prose",
  });

  const result = await runAllAgents(client, "test task", null, {
    agents: AGENCY_AGENTS,
  });

  // Shape assertions — the contract.
  assert.ok(result && typeof result === "object", "result must be an object");
  assert.ok("byName" in result, "result.byName required");
  assert.ok("errors" in result, "result.errors required");
  assert.ok(Array.isArray(result.errors), "result.errors must be array");

  // The bug: callers that did `const byName = await runAllAgents(...)`
  // would get `byName.Analyst === undefined`, and `byName.Analyst || ""`
  // would silently become "". This assertion proves the contract was
  // violated by the old shape: the top-level object does NOT have agent
  // names as keys — they're nested under `byName`.
  assert.equal(result.Analyst, undefined, "agent names live under .byName, not at top level");

  // Each agent's row carries an `interpretation` property.
  for (const a of AGENCY_AGENTS) {
    const row = result.byName[a.name];
    assert.ok(row, `byName[${a.name}] missing`);
    assert.equal(typeof row.interpretation, "string", `byName[${a.name}].interpretation must be string`);
    assert.equal(row.name, a.name);
    assert.equal(row.error || false, false, `byName[${a.name}] should not be error`);
  }
});

test("runAllAgents partial-result: one failure does not lose the others", async () => {
  // Stub a client that succeeds for two agents and rejects for one.
  const client = {
    messages: {
      create: async ({ system }) => {
        const m = system.match(/You are the ([A-Z][\w\s]*?)\./);
        const name = m ? m[1].trim() : "Unknown";
        if (name === "SDR") {
          throw new Error("simulated SDR API failure");
        }
        return {
          content: [{ type: "text", text: `${name} ok` }],
          stop_reason: "end_turn",
        };
      },
    },
  };

  const { byName, errors } = await runAllAgents(client, "test task", null, {
    agents: AGENCY_AGENTS,
  });

  assert.equal(errors.length, 1, "exactly one error");
  assert.equal(errors[0].agent_name, "SDR");
  assert.match(errors[0].reason, /simulated SDR/);

  // Other agents still produced results.
  assert.equal(byName.Analyst.interpretation, "Analyst ok");
  assert.equal(byName.Auditor.interpretation, "Auditor ok");

  // Failed agent has the error-shaped row, not undefined.
  assert.equal(byName.SDR.error, true);
  assert.equal(byName.SDR.interpretation, "");
});

test("runAllAgents handles introspective set without throwing on shape", async () => {
  // Smoke test: the introspective set has 12 agents. Confirm shape parity.
  const client = makeStubClient({});
  const { byName, errors } = await runAllAgents(client, "test state", null, {
    agents: INTROSPECTIVE_AGENTS,
  });

  assert.equal(errors.length, 0, "no errors on stub success path");
  assert.equal(Object.keys(byName).length, 12, "12 introspective agents");
  for (const a of INTROSPECTIVE_AGENTS) {
    assert.ok(byName[a.name], `byName[${a.name}] present`);
    assert.equal(byName[a.name].register, a.register);
  }
});
