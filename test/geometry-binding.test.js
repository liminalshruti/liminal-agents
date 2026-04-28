// Geometry-binding test — Layer 3 of c-hard-iii (CHARD3_PLAN.md).
//
// Verifies that the prompt + validator combination structurally enforces
// PPA #4: refusals from geometry-bound agents are classified valid only
// when the target lies in the agent's vector occupants. Out-of-vector
// refusals against the same allowlist are surfaced as geometry_violation.
//
// Coverage:
//   - All 12 introspective agents have (hour, face) typing.
//   - 10 of 12 are geometry-bound (≥1 vector occupant).
//   - 2 of 12 (Architect, Witness) are vector-isolated — fall back to
//     full allowlist; geometry check is skipped for them.
//
// This test does not call the Anthropic API. It synthesizes refusal
// outputs and checks the validator's classification given the agent
// typing. The patent claim being enforced: bound construction
// (in bounded-system-prompt.js) and bound enforcement (in
// validation.js) are structurally coupled.

import { test } from "node:test";
import assert from "node:assert/strict";
import { INTROSPECTIVE_AGENTS } from "../lib/agents/index.js";
import { classifyInterpretation } from "../lib/agents/validation.js";
import { describeBound } from "../lib/agents/bounded-system-prompt.js";
import {
  hasArchetypeBase,
  vectorOccupants,
  isVectorIsolated,
} from "../lib/agents/archetype-base.js";

test("c-hard-iii: every introspective agent has (hour, face) typing", () => {
  for (const agent of INTROSPECTIVE_AGENTS) {
    assert.ok(
      hasArchetypeBase(agent),
      `agent ${agent.name} missing (hour, face) typing — c-hard-iii requires full coverage`,
    );
  }
});

test("c-hard-iii: bound classification matches CHARD3_PLAN.md coverage table", () => {
  // CHARD3_PLAN.md coverage table:
  //   Architect (10-inner) → outer-4 empty, outer-10 empty → vector-isolated
  //   Witness   (12-inner) → inner-6 empty, outer-12 empty → vector-isolated
  //   All other 10 agents → ≥1 occupant → geometry-bound
  //
  // This test pins the table. If a future agent (re)assignment changes the
  // coverage, this assertion fails and the planning artifact must be
  // updated in the same change.

  const bounds = {};
  for (const agent of INTROSPECTIVE_AGENTS) {
    bounds[agent.name] = describeBound(agent, INTROSPECTIVE_AGENTS).kind;
  }

  // Vector-isolated.
  assert.equal(bounds.Architect, "vector-isolated", "Architect must be vector-isolated");
  assert.equal(bounds.Witness, "vector-isolated", "Witness must be vector-isolated");

  // Geometry-bound (the other 10).
  for (const name of [
    "Strategist", "Economist",
    "Physician", "Child",
    "Historian", "Cartographer", "Elder",
    "Contrarian", "Mystic", "Betrayer",
  ]) {
    assert.equal(bounds[name], "geometry-bound", `${name} must be geometry-bound`);
  }
});

test("c-hard-iii: validator classifies in-vector refusals as valid_refusal", () => {
  // For each geometry-bound agent, pick one of its vector occupants and
  // construct a synthetic refusal. The validator should accept it.
  for (const agent of INTROSPECTIVE_AGENTS) {
    if (isVectorIsolated(agent, INTROSPECTIVE_AGENTS)) continue;
    const occupants = vectorOccupants(agent, INTROSPECTIVE_AGENTS);
    const target = occupants[0];

    const refusal = `REFUSE: ${target.name}\nRequest belongs to the ${target.name}'s lane.`;
    const result = classifyInterpretation(refusal, INTROSPECTIVE_AGENTS, {
      activeAgent: agent,
    });

    assert.equal(
      result.kind,
      "valid_refusal",
      `${agent.name} → ${target.name} (in vectors) should be valid_refusal, got ${result.kind}`,
    );
    assert.equal(result.target, target.name);
  }
});

test("c-hard-iii: validator flags out-of-vector refusals as geometry_violation", () => {
  // For each geometry-bound agent, pick a peer that is NOT in its vectors
  // and construct a synthetic refusal. The validator should classify
  // geometry_violation.
  for (const agent of INTROSPECTIVE_AGENTS) {
    if (isVectorIsolated(agent, INTROSPECTIVE_AGENTS)) continue;
    const occupants = vectorOccupants(agent, INTROSPECTIVE_AGENTS);
    const occupantNames = new Set(occupants.map((a) => a.name));

    // Find a peer NOT in vectors AND not the agent itself.
    const offTarget = INTROSPECTIVE_AGENTS.find(
      (a) => a.name !== agent.name && !occupantNames.has(a.name),
    );
    assert.ok(offTarget, `${agent.name}: no off-vector peer to test against`);

    const refusal = `REFUSE: ${offTarget.name}\nRequest belongs to the ${offTarget.name}'s lane.`;
    const result = classifyInterpretation(refusal, INTROSPECTIVE_AGENTS, {
      activeAgent: agent,
    });

    assert.equal(
      result.kind,
      "geometry_violation",
      `${agent.name} → ${offTarget.name} (out-of-vector) should be geometry_violation, got ${result.kind}`,
    );
    assert.equal(result.target, offTarget.name);
    assert.deepEqual(
      result.vector_occupants,
      occupants.map((a) => a.name).sort(),
    );
  }
});

test("c-hard-iii: vector-isolated agents accept any allowlisted target as valid_refusal", () => {
  // Architect and Witness fall back to the full allowlist. The validator
  // must NOT raise geometry_violation for them — they have no vectors.
  for (const agent of INTROSPECTIVE_AGENTS) {
    if (!isVectorIsolated(agent, INTROSPECTIVE_AGENTS)) continue;

    // Pick any peer.
    const peer = INTROSPECTIVE_AGENTS.find((a) => a.name !== agent.name);
    const refusal = `REFUSE: ${peer.name}\nLane boundary statement.`;
    const result = classifyInterpretation(refusal, INTROSPECTIVE_AGENTS, {
      activeAgent: agent,
    });

    assert.equal(
      result.kind,
      "valid_refusal",
      `vector-isolated ${agent.name} → ${peer.name} should be valid_refusal, got ${result.kind}`,
    );
  }
});

test("c-hard-iii: validator without activeAgent retains classical behavior", () => {
  // Backward compatibility: callers that don't pass opts.activeAgent get
  // the classical valid_refusal / unknown_target / malformed_refusal
  // / prose / empty kinds. No geometry check.
  const refusal = "REFUSE: Mystic\nSymbolic reading lane.";

  // Without activeAgent → classical valid_refusal regardless of who
  // "uttered" it.
  const r = classifyInterpretation(refusal, INTROSPECTIVE_AGENTS);
  assert.equal(r.kind, "valid_refusal");
  assert.equal(r.target, "Mystic");

  // Same input WITH activeAgent → may classify differently per geometry.
  // Strategist (5-inner) → vectors are Elder, Historian (geometric only).
  // Mystic is NOT in those vectors → geometry_violation.
  const strategist = INTROSPECTIVE_AGENTS.find((a) => a.name === "Strategist");
  const r2 = classifyInterpretation(refusal, INTROSPECTIVE_AGENTS, {
    activeAgent: strategist,
  });
  assert.equal(r2.kind, "geometry_violation");
});
