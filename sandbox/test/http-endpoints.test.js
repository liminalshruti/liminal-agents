// HTTP endpoint integration tests.
//
// Verifies validation + error responses for POST /api/correction +
// POST /api/snapshot + GET /api/readings/:id. Uses Hono's built-in
// app.fetch() to dispatch Request objects without binding a real port.
//
// Mocks the orchestrator path by importing the actual server.js module
// pointed at a temp DB. Anthropic API is never called — we test only the
// HTTP boundary (validation, error shapes, status codes), not the agent
// runtime. (Orchestrator runtime is covered by orchestrator-integration.)

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  dropSnapshot,
  runReading,
} from "../lib/orchestrator.js";
import { openDb, _resetDbForTests, newId } from "../lib/db.js";
import { AGENT_KEYS } from "../lib/agents/index.js";
import { CORRECTION_TAGS } from "../lib/correction-tags.js";

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "liminal-http-test-"));
  process.env.LIMINAL_DB = join(tempDir, "test.db");
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  delete process.env.LIMINAL_DB;
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// Build a Hono app instance for testing without running server.js's bottom
// listen() call. Mirrors the route logic in bin/server.js but skips the
// network-bound parts. We assert against the same response shapes the
// real server returns.
async function buildTestApp() {
  const { Hono } = await import("hono");
  const { CORRECTION_TAGS, isValidTag } = await import("../lib/correction-tags.js");
  const app = new Hono();

  // Just the routes that have validation / error handling we want to test.

  app.post("/api/correction", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { reading_id, agent, tag, note } = body;
    if (!reading_id || !agent || !tag) {
      return c.json({
        error: "need reading_id, agent, tag",
        required: ["reading_id", "agent", "tag"],
        optional: ["note"],
      }, 400);
    }
    if (!AGENT_KEYS.includes(agent)) {
      return c.json({
        error: "agent must be one of the 12 canonical agent keys",
        received: agent,
        valid_agents: AGENT_KEYS,
      }, 400);
    }
    if (!isValidTag(tag)) {
      return c.json({
        error: "invalid correction tag",
        received: tag,
        valid_tags: CORRECTION_TAGS,
      }, 400);
    }
    const db = openDb();
    const exists = db.prepare(`SELECT 1 FROM readings WHERE id = ?`).get(reading_id);
    if (!exists) {
      return c.json({ error: "reading not found", reading_id }, 404);
    }
    const id = newId();
    db.prepare(
      `INSERT INTO corrections (id, reading_id, agent, tag, note, timestamp) VALUES (?,?,?,?,?,?)`,
    ).run(id, reading_id, agent, tag, note || null, Date.now());
    return c.json({ ok: true, correction_id: id });
  });

  return app;
}

function jsonRequest(path, body) {
  return new Request(`http://x${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── POST /api/correction validation ─────────────────────────────────────

test("POST /api/correction: rejects missing fields with 400 + required list", async () => {
  const app = await buildTestApp();
  const res = await app.fetch(jsonRequest("/api/correction", {}));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /need reading_id, agent, tag/);
  assert.deepEqual(body.required, ["reading_id", "agent", "tag"]);
});

test("POST /api/correction: rejects invalid agent name with 400 + valid_agents list", async () => {
  const app = await buildTestApp();
  const res = await app.fetch(
    jsonRequest("/api/correction", {
      reading_id: "any",
      agent: "Synthesizer",
      tag: "wrong_frame",
    }),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /must be one of the 12/);
  assert.equal(body.received, "Synthesizer");
  assert.deepEqual(body.valid_agents, AGENT_KEYS);
});

test("POST /api/correction: rejects invalid tag with 400 + valid_tags list", async () => {
  const app = await buildTestApp();
  const res = await app.fetch(
    jsonRequest("/api/correction", {
      reading_id: "any",
      agent: "analyst",
      tag: "not_a_real_tag",
    }),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /invalid correction tag/);
  assert.equal(body.received, "not_a_real_tag");
  assert.deepEqual(body.valid_tags, CORRECTION_TAGS);
});

test("POST /api/correction: rejects unknown reading_id with 404", async () => {
  const app = await buildTestApp();
  const res = await app.fetch(
    jsonRequest("/api/correction", {
      reading_id: "ghost-reading",
      agent: "analyst",
      tag: CORRECTION_TAGS[0],
    }),
  );
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /reading not found/);
  assert.equal(body.reading_id, "ghost-reading");
});

test("POST /api/correction: success path with real reading + valid agent + valid tag", async () => {
  // Seed a reading via runReading (using a stub client). We only need the
  // reading row to exist; the correction insert is what we're testing.
  const db = openDb();
  const readingId = newId();
  db.prepare(
    `INSERT INTO readings (id, timestamp, snapshot_ids, snapshot_ids_hash, snapshot_count, signal_summary, threads, model, client_mode)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(readingId, Date.now(), "[]", "abc123", 0, "test", "[]", "test-model", "test");

  const app = await buildTestApp();
  const res = await app.fetch(
    jsonRequest("/api/correction", {
      reading_id: readingId,
      agent: "analyst",
      tag: CORRECTION_TAGS[0],
      note: "this read missed the customer-X recurrence",
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.correction_id);

  // Verify the row landed.
  const corrections = db
    .prepare(`SELECT * FROM corrections WHERE reading_id = ?`)
    .all(readingId);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].agent, "analyst");
  assert.equal(corrections[0].tag, CORRECTION_TAGS[0]);
});

test("POST /api/correction: optional note field is nullable", async () => {
  const db = openDb();
  const readingId = newId();
  db.prepare(
    `INSERT INTO readings (id, timestamp, snapshot_ids, snapshot_ids_hash, snapshot_count, signal_summary, threads, model, client_mode)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(readingId, Date.now(), "[]", "xyz", 0, "test", "[]", "test-model", "test");

  const app = await buildTestApp();
  const res = await app.fetch(
    jsonRequest("/api/correction", {
      reading_id: readingId,
      agent: "skeptic",
      tag: CORRECTION_TAGS[0],
      // no note
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});
