// Tests for bounded re-read (refinement) of a single agent.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { refineAgentRead, getRefinementChain } from "../lib/refine.js";
import { openDb, _resetDbForTests, newId } from "../lib/db.js";

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "liminal-refine-test-"));
  process.env.LIMINAL_DB = join(tempDir, "test.db");
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  delete process.env.LIMINAL_DB;
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

function seedReadingWithViews(agentInterpretations) {
  const readingId = newId();
  const db = openDb();
  db.prepare(
    `INSERT INTO readings (id, timestamp, snapshot_ids, snapshot_ids_hash, snapshot_count, signal_summary, threads, model, client_mode)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    readingId,
    Date.now(),
    "[]",
    "x",
    0,
    "Three threads: customer escalation, missed standup, deferred hire.",
    JSON.stringify([
      { label: "customer escalation", summary: "Customer X escalated three times." },
    ]),
    "test-model",
    "test",
  );
  for (const [agent_key, interpretation] of Object.entries(agentInterpretations)) {
    db.prepare(
      `INSERT INTO agent_views (reading_id, agent_key, register, interpretation) VALUES (?,?,?,?)`,
    ).run(readingId, agent_key, "Diligence", interpretation);
  }
  return readingId;
}

function mockClient(responseText) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: responseText }],
        stop_reason: "end_turn",
      }),
    },
  };
}

// ─── refineAgentRead happy paths ─────────────────────────────────────────

test("refineAgentRead: stores a refined view + does not overwrite original", async () => {
  const readingId = seedReadingWithViews({
    analyst: "Customer X has escalated three weeks running.",
  });
  const client = mockClient("Refined: Customer X actually escalated four times once we count the original ticket.");

  const result = await refineAgentRead({
    client,
    readingId,
    agentKey: "analyst",
    refinement: "the original ticket from week 1 also counts as an escalation",
  });

  assert.equal(result.reading_id, readingId);
  assert.equal(result.agent_key, "analyst");
  assert.match(result.interpretation, /four times/);

  // Original agent_view is preserved.
  const db = openDb();
  const original = db
    .prepare(`SELECT interpretation FROM agent_views WHERE reading_id = ? AND agent_key = ?`)
    .get(readingId, "analyst");
  assert.match(original.interpretation, /three weeks running/);

  // Refined view exists.
  const refined = db
    .prepare(`SELECT * FROM refined_views WHERE id = ?`)
    .get(result.refined_id);
  assert.ok(refined);
  assert.equal(refined.agent_key, "analyst");
  assert.match(refined.interpretation, /four times/);
});

test("refineAgentRead: rejects unknown agent_key", async () => {
  const readingId = seedReadingWithViews({});
  const client = mockClient("never called");
  await assert.rejects(
    () =>
      refineAgentRead({
        client,
        readingId,
        agentKey: "synthesizer", // not real
        refinement: "x",
      }),
    /unknown agent_key/,
  );
});

test("refineAgentRead: rejects empty refinement", async () => {
  const readingId = seedReadingWithViews({});
  const client = mockClient("never called");
  await assert.rejects(
    () =>
      refineAgentRead({
        client,
        readingId,
        agentKey: "analyst",
        refinement: "",
      }),
    /non-empty string/,
  );
});

test("refineAgentRead: rejects unknown reading", async () => {
  const client = mockClient("never called");
  await assert.rejects(
    () =>
      refineAgentRead({
        client,
        readingId: "ghost",
        agentKey: "analyst",
        refinement: "x",
      }),
    /reading not found/,
  );
});

// ─── Chain semantics ─────────────────────────────────────────────────────

test("refineAgentRead: chains via parent_refined_id (same agent only)", async () => {
  const readingId = seedReadingWithViews({
    analyst: "First read.",
  });
  const client = mockClient("Chained read.");

  const r1 = await refineAgentRead({
    client,
    readingId,
    agentKey: "analyst",
    refinement: "first refinement",
  });
  const r2 = await refineAgentRead({
    client,
    readingId,
    agentKey: "analyst",
    refinement: "second refinement",
    parentRefinedId: r1.refined_id,
  });

  const chain = getRefinementChain(readingId, "analyst");
  assert.equal(chain.length, 2);
  assert.equal(chain[0].id, r1.refined_id);
  assert.equal(chain[1].id, r2.refined_id);
  assert.equal(chain[1].parent_refined_id, r1.refined_id);
});

test("refineAgentRead: parent must belong to the SAME agent", async () => {
  const readingId = seedReadingWithViews({
    analyst: "Analyst's first read.",
    skeptic: "Skeptic's first read.",
  });
  const client = mockClient("ok");

  // Refine Analyst.
  const r1 = await refineAgentRead({
    client,
    readingId,
    agentKey: "analyst",
    refinement: "x",
  });

  // Try to chain Skeptic off an Analyst refinement — must reject.
  await assert.rejects(
    () =>
      refineAgentRead({
        client,
        readingId,
        agentKey: "skeptic",
        refinement: "y",
        parentRefinedId: r1.refined_id,
      }),
    /parent refinement is from agent "analyst", not "skeptic"/,
  );
});

test("getRefinementChain: returns empty array when no refinements", () => {
  const readingId = seedReadingWithViews({ analyst: "first" });
  const chain = getRefinementChain(readingId, "analyst");
  assert.deepEqual(chain, []);
});

test("getRefinementChain: returns rows in chronological order", async () => {
  const readingId = seedReadingWithViews({ analyst: "first" });
  const client = mockClient("ok");

  const r1 = await refineAgentRead({ client, readingId, agentKey: "analyst", refinement: "a" });
  // Slight delay so timestamps differ.
  await new Promise((r) => setTimeout(r, 5));
  const r2 = await refineAgentRead({ client, readingId, agentKey: "analyst", refinement: "b" });

  const chain = getRefinementChain(readingId, "analyst");
  assert.equal(chain.length, 2);
  assert.ok(chain[0].timestamp <= chain[1].timestamp);
});
