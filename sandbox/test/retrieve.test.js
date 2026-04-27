// Tests for FTS5-backed retrieval over snapshots + corrections.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { dropSnapshot } from "../lib/orchestrator.js";
import { openDb, _resetDbForTests, newId } from "../lib/db.js";
import { retrieveSnapshots, retrieveCorrections, retrieveAll } from "../lib/retrieve.js";

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "liminal-retrieve-test-"));
  process.env.LIMINAL_DB = join(tempDir, "test.db");
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  delete process.env.LIMINAL_DB;
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

function seedSnapshots() {
  dropSnapshot({
    kind: "incident",
    text: "Customer X has escalated three times this week through different channels.",
    label: "Customer X escalation",
  });
  dropSnapshot({
    kind: "meeting",
    text: "Eric missed standup again. Team is asking Maya about it.",
    label: "Eric absence",
  });
  dropSnapshot({
    kind: "decision",
    text: "Postponed the head of eng offer for the third time.",
    label: "Head of eng deferred",
  });
  dropSnapshot({
    kind: "paste",
    text: "Sleep is broken. Ten days of waking up at 4am circling that call.",
    label: "Sleep loss",
  });
}

function seedCorrection(reading_id, agent, tag, note) {
  const db = openDb();
  const id = newId();
  db.prepare(
    `INSERT INTO corrections (id, reading_id, agent, tag, note, timestamp) VALUES (?,?,?,?,?,?)`,
  ).run(id, reading_id, agent, tag, note, Date.now());
  return id;
}

function seedReading(id) {
  const db = openDb();
  db.prepare(
    `INSERT INTO readings (id, timestamp, snapshot_ids, snapshot_ids_hash, snapshot_count, signal_summary, threads, model, client_mode)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(id, Date.now(), "[]", "x", 0, "test", "[]", "test-model", "test");
}

// ─── retrieveSnapshots ────────────────────────────────────────────────────

test("retrieveSnapshots: empty query returns empty", () => {
  seedSnapshots();
  assert.deepEqual(retrieveSnapshots(""), []);
  assert.deepEqual(retrieveSnapshots(null), []);
  assert.deepEqual(retrieveSnapshots("   "), []);
});

test("retrieveSnapshots: matches by stemmed token (escalates → escalation)", () => {
  seedSnapshots();
  const results = retrieveSnapshots("escalating customer");
  assert.ok(results.length > 0, "should match snapshot about Customer X escalating");
  assert.ok(results.some((r) => r.label === "Customer X escalation"));
});

test("retrieveSnapshots: returns rows ordered by BM25 score (best first)", () => {
  seedSnapshots();
  const results = retrieveSnapshots("eric standup", { limit: 5 });
  assert.ok(results.length > 0);
  assert.equal(results[0].label, "Eric absence");
});

test("retrieveSnapshots: respects limit cap", () => {
  for (let i = 0; i < 30; i++) {
    dropSnapshot({ kind: "paste", text: `customer ${i} escalation note`, label: `c${i}` });
  }
  const r5 = retrieveSnapshots("customer", { limit: 5 });
  assert.ok(r5.length <= 5);
  const r1 = retrieveSnapshots("customer", { limit: 1 });
  assert.equal(r1.length, 1);
});

test("retrieveSnapshots: limit clamped to MAX_LIMIT (50)", () => {
  for (let i = 0; i < 60; i++) {
    dropSnapshot({ kind: "paste", text: `widget ${i}`, label: `w${i}` });
  }
  const results = retrieveSnapshots("widget", { limit: 999 });
  assert.ok(results.length <= 50);
});

test("retrieveSnapshots: excludes archived snapshots by default", () => {
  seedSnapshots();
  const db = openDb();
  db.prepare(`UPDATE snapshots SET archived = 1 WHERE label = 'Eric absence'`).run();

  const results = retrieveSnapshots("eric");
  assert.ok(!results.some((r) => r.archived === 1), "archived rows should be excluded");

  const withArchived = retrieveSnapshots("eric", { includeArchived: true });
  assert.ok(withArchived.length > 0, "includeArchived: true returns archived rows");
});

test("retrieveSnapshots: nonsense query returns empty without error", () => {
  seedSnapshots();
  const results = retrieveSnapshots("zxcvbnmqwertyasdfgh");
  assert.deepEqual(results, []);
});

// ─── retrieveCorrections ──────────────────────────────────────────────────

test("retrieveCorrections: returns matching corrections by note text", () => {
  const readingId = newId();
  seedReading(readingId);
  seedCorrection(readingId, "analyst", "wrong_frame", "missed the customer X recurrence pattern");
  seedCorrection(readingId, "skeptic", "too_generic", "this is too vague to be useful");

  const results = retrieveCorrections("customer recurrence");
  assert.ok(results.length > 0);
  assert.equal(results[0].agent, "analyst");
});

test("retrieveCorrections: filter by agent narrows results", () => {
  const readingId = newId();
  seedReading(readingId);
  seedCorrection(readingId, "analyst", "wrong_frame", "customer pattern missed");
  seedCorrection(readingId, "skeptic", "too_generic", "customer language too generic");

  const all = retrieveCorrections("customer");
  assert.equal(all.length, 2);

  const analystOnly = retrieveCorrections("customer", { agentKey: "analyst" });
  assert.equal(analystOnly.length, 1);
  assert.equal(analystOnly[0].agent, "analyst");
});

test("retrieveCorrections: filter by tag narrows results", () => {
  const readingId = newId();
  seedReading(readingId);
  seedCorrection(readingId, "analyst", "wrong_frame", "issue alpha");
  seedCorrection(readingId, "analyst", "too_generic", "issue alpha again");

  const wrong = retrieveCorrections("issue", { tag: "wrong_frame" });
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].tag, "wrong_frame");
});

// ─── retrieveAll ──────────────────────────────────────────────────────────

test("retrieveAll: returns both snapshots and corrections", () => {
  seedSnapshots();
  const readingId = newId();
  seedReading(readingId);
  seedCorrection(readingId, "analyst", "wrong_frame", "customer recurrence note");

  const result = retrieveAll("customer");
  assert.ok(Array.isArray(result.snapshots));
  assert.ok(Array.isArray(result.corrections));
  assert.ok(result.snapshots.length > 0);
  assert.ok(result.corrections.length > 0);
});

// ─── FTS triggers stay in sync ────────────────────────────────────────────

test("FTS index stays in sync when snapshots are added/removed", () => {
  const initial = retrieveSnapshots("widget");
  assert.equal(initial.length, 0);

  const s1 = dropSnapshot({ kind: "paste", text: "widget alpha shipped", label: "widget event" });

  const after = retrieveSnapshots("widget");
  assert.equal(after.length, 1);

  const db = openDb();
  db.prepare(`DELETE FROM snapshots WHERE id = ?`).run(s1.id);

  const afterDelete = retrieveSnapshots("widget");
  assert.equal(afterDelete.length, 0, "FTS delete trigger should clean up");
});
