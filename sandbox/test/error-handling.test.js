// Unit tests for the partial-result error model.
//
// runAllAgents must:
//   - Return { byKey, errors }
//   - Use Promise.allSettled (single failure does not lose the other 11)
//   - Provide a placeholder { error: true, interpretation: "" } per failed agent
//
// runAgent must:
//   - Throw on missing text content (so allSettled can capture it)
//   - Surface refusal-classification warnings via console.warn but not reject
//
// synthesis must log on parse failure but return a graceful fallback.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGENTS,
  AGENT_KEYS,
  runAgent,
  runAllAgents,
} from "../lib/agents/index.js";
import { synthesizeAcrossSnapshots } from "../lib/synthesis.js";

// ─── Mock client helpers ─────────────────────────────────────────────────

function mockClient(responder) {
  return {
    messages: {
      create: async (req) => responder(req),
    },
  };
}

function textResponse(text) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
  };
}

function emptyResponse() {
  return {
    content: [],
    stop_reason: "max_tokens",
  };
}

// ─── runAgent: error propagation ─────────────────────────────────────────

test("runAgent throws on empty content (not silent)", async () => {
  const client = mockClient(() => emptyResponse());
  const agent = AGENTS[0];
  await assert.rejects(
    () => runAgent(client, agent, "test state", "", "test-model"),
    /no text in API response/,
  );
});

test("runAgent throws if text block exists but is empty string", async () => {
  const client = mockClient(() => textResponse(""));
  const agent = AGENTS[0];
  await assert.rejects(
    () => runAgent(client, agent, "test state", "", "test-model"),
    /no text in API response/,
  );
});

test("runAgent succeeds with non-empty text and includes classification", async () => {
  const client = mockClient(() => textResponse("Customer X has escalated three weeks."));
  const result = await runAgent(client, AGENTS[0], "test state", "", "test-model");
  assert.equal(result.key, AGENTS[0].key);
  assert.equal(result.interpretation, "Customer X has escalated three weeks.");
  assert.equal(result.classification, "prose");
});

test("runAgent classifies a valid refusal", async () => {
  const client = mockClient(() => textResponse("REFUSE: Strategist · this needs the consequence chain"));
  const result = await runAgent(client, AGENTS[0], "test state", "", "test-model");
  assert.equal(result.classification, "valid_refusal");
});

// ─── runAllAgents: partial-result via Promise.allSettled ─────────────────

test("runAllAgents returns { byKey, errors } shape", async () => {
  const client = mockClient(() => textResponse("ok"));
  const result = await runAllAgents(client, "state", "ctx", "test-model");
  assert.ok(result.byKey);
  assert.ok(Array.isArray(result.errors));
});

test("runAllAgents returns 12 entries in byKey when all succeed", async () => {
  const client = mockClient(() => textResponse("a valid in-lane read."));
  const { byKey, errors } = await runAllAgents(client, "state", "ctx", "test-model");
  assert.equal(Object.keys(byKey).length, 12);
  assert.equal(errors.length, 0);
  for (const k of AGENT_KEYS) {
    assert.equal(byKey[k].interpretation, "a valid in-lane read.");
  }
});

test("runAllAgents tolerates a single agent failure without losing the others", async () => {
  let callCount = 0;
  const client = mockClient(() => {
    callCount++;
    // Fail every 5th call (so ~2-3 of 12 fail, depending on order).
    if (callCount % 5 === 0) return emptyResponse();
    return textResponse("an in-lane read.");
  });

  const { byKey, errors } = await runAllAgents(client, "state", "ctx", "test-model");

  assert.equal(Object.keys(byKey).length, 12, "all 12 keys present");
  assert.ok(errors.length > 0, "at least one error captured");
  assert.ok(errors.length < 12, "not all agents failed");

  // Errors are well-shaped.
  for (const e of errors) {
    assert.ok(AGENT_KEYS.includes(e.agent_key), `${e.agent_key} is a valid key`);
    assert.match(e.reason, /no text in API response/);
  }

  // Each errored agent gets a placeholder with error: true.
  for (const e of errors) {
    const placeholder = byKey[e.agent_key];
    assert.equal(placeholder.error, true);
    assert.equal(placeholder.interpretation, "");
    assert.equal(placeholder.error_reason, e.reason);
  }
});

test("runAllAgents survives ALL 12 agents failing (degenerate but safe)", async () => {
  const client = mockClient(() => emptyResponse());
  const { byKey, errors } = await runAllAgents(client, "state", "ctx", "test-model");
  assert.equal(errors.length, 12);
  for (const k of AGENT_KEYS) {
    assert.equal(byKey[k].error, true);
    assert.equal(byKey[k].interpretation, "");
  }
});

// ─── synthesis: graceful fallback with logging ───────────────────────────

test("synthesizeAcrossSnapshots returns fallback if response has no JSON", async () => {
  const client = mockClient(() => textResponse("This response is plain prose with no JSON."));
  const snapshots = [{ id: "s1", timestamp: Date.now(), kind: "paste", text: "x" }];
  const result = await synthesizeAcrossSnapshots(client, snapshots, "test-model");
  // Fallback summary names the snapshot count and signals unavailability.
  assert.match(result.signal_summary, /1 snapshots dropped/);
  assert.deepEqual(result.threads, []);
});

test("synthesizeAcrossSnapshots returns fallback if JSON is malformed", async () => {
  // Has matching braces so the regex matches, but content is invalid JSON.
  // (Trailing comma is not valid JSON.)
  const client = mockClient(() =>
    textResponse('{ "signal_summary": "test", "threads": [], }'),
  );
  const snapshots = [{ id: "s1", timestamp: Date.now(), kind: "paste", text: "x" }];
  const result = await synthesizeAcrossSnapshots(client, snapshots, "test-model");
  assert.match(result.signal_summary, /unparseable/);
});

test("synthesizeAcrossSnapshots returns parsed JSON on success", async () => {
  const client = mockClient(() =>
    textResponse(
      JSON.stringify({
        signal_summary: "Three threads visible.",
        threads: [
          { label: "thread one", snapshot_ids: ["s1"], summary: "first" },
        ],
      }),
    ),
  );
  const snapshots = [{ id: "s1", timestamp: Date.now(), kind: "paste", text: "x" }];
  const result = await synthesizeAcrossSnapshots(client, snapshots, "test-model");
  assert.equal(result.signal_summary, "Three threads visible.");
  assert.equal(result.threads.length, 1);
  assert.equal(result.threads[0].label, "thread one");
});

test("synthesizeAcrossSnapshots truncates threads to 3", async () => {
  const client = mockClient(() =>
    textResponse(
      JSON.stringify({
        signal_summary: "Many threads.",
        threads: [
          { label: "t1", snapshot_ids: [], summary: "" },
          { label: "t2", snapshot_ids: [], summary: "" },
          { label: "t3", snapshot_ids: [], summary: "" },
          { label: "t4", snapshot_ids: [], summary: "" },
          { label: "t5", snapshot_ids: [], summary: "" },
        ],
      }),
    ),
  );
  const snapshots = [{ id: "s1", timestamp: Date.now(), kind: "paste", text: "x" }];
  const result = await synthesizeAcrossSnapshots(client, snapshots, "test-model");
  assert.equal(result.threads.length, 3);
});

test("synthesizeAcrossSnapshots returns empty for empty vault", async () => {
  const client = mockClient(() => textResponse("never called"));
  const result = await synthesizeAcrossSnapshots(client, [], "test-model");
  assert.equal(result.signal_summary, "");
  assert.deepEqual(result.threads, []);
});
