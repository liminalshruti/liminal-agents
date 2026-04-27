// Integration tests for the orchestrator → vault path.
//
// Verifies the architectural claim end-to-end against an in-memory mock
// client + a temp SQLite database:
//
//   1. runReading() produces 12 agent_views rows for a successful read
//   2. Partial failures store ONLY the successful agents' views
//   3. Cache keying by (snapshot_ids_hash, model) — same vault + same model
//      returns cached; different model produces fresh read
//   4. Cache invalidation when snapshots are added/archived
//   5. The vault is empty when nothing has been dropped (fast reject)

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  dropSnapshot,
  runReading,
  listActiveSnapshots,
  archiveSnapshot,
  clearVault,
} from "../lib/orchestrator.js";
import { openDb, _resetDbForTests } from "../lib/db.js";
import { AGENTS, AGENT_KEYS } from "../lib/agents/index.js";

// ─── Test harness ────────────────────────────────────────────────────────

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "liminal-orch-test-"));
  process.env.LIMINAL_DB = join(tempDir, "test.db");
  _resetDbForTests();
});

afterEach(() => {
  _resetDbForTests();
  delete process.env.LIMINAL_DB;
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// Mock client: returns a deterministic response for synthesis (JSON-shaped)
// and for agent reads (in-lane prose). Fail-on-call lets us simulate partial
// failures.
function mockClient({ failAgentKeys = [] } = {}) {
  let callIdx = 0;
  return {
    messages: {
      create: async (req) => {
        callIdx++;
        const isSynthesis =
          req.messages[0].content.includes("snapshots a founder dropped");
        if (isSynthesis) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  signal_summary: "Synthetic test summary.",
                  threads: [
                    { label: "test thread", snapshot_ids: ["any"], summary: "test" },
                  ],
                }),
              },
            ],
            stop_reason: "end_turn",
          };
        }
        // Agent call. Determine which agent by matching the system prompt.
        const matchedAgent = AGENTS.find((a) => req.system === a.system);
        const agentKey = matchedAgent?.key || "unknown";
        if (failAgentKeys.includes(agentKey)) {
          return { content: [], stop_reason: "max_tokens" };
        }
        return {
          content: [{ type: "text", text: `read from ${agentKey}` }],
          stop_reason: "end_turn",
        };
      },
    },
  };
}

function seedSnapshots(n = 3) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const s = dropSnapshot({
      kind: "paste",
      text: `snapshot ${i} content`,
      label: `s${i}`,
    });
    ids.push(s.id);
  }
  return ids;
}

// ─── Tests ───────────────────────────────────────────────────────────────

test("runReading inserts exactly 12 agent_views rows for a successful read", async () => {
  seedSnapshots(3);
  const result = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
  });

  assert.equal(result.snapshot_count, 3);
  assert.equal(result.agent_errors.length, 0);

  const db = openDb();
  const views = db
    .prepare(`SELECT agent_key FROM agent_views WHERE reading_id = ? ORDER BY agent_key`)
    .all(result.reading_id);
  assert.equal(views.length, 12);

  const keys = views.map((v) => v.agent_key).sort();
  assert.deepEqual(keys, [...AGENT_KEYS].sort());
});

test("runReading stores ONLY successful agents when some fail", async () => {
  seedSnapshots(2);
  const failKeys = ["analyst", "skeptic"];
  const result = await runReading({
    client: mockClient({ failAgentKeys: failKeys }),
    mode: "test",
    model: "test-model",
  });

  assert.equal(result.agent_errors.length, 2);
  assert.deepEqual(
    result.agent_errors.map((e) => e.agent_key).sort(),
    [...failKeys].sort(),
  );

  const db = openDb();
  const views = db
    .prepare(`SELECT agent_key FROM agent_views WHERE reading_id = ?`)
    .all(result.reading_id);

  // Only 10 rows stored (analyst and skeptic excluded).
  assert.equal(views.length, 10);
  const keys = views.map((v) => v.agent_key);
  assert.ok(!keys.includes("analyst"), "failed agent should not have a view row");
  assert.ok(!keys.includes("skeptic"), "failed agent should not have a view row");

  // The reading row itself is still stored.
  const readingRow = db
    .prepare(`SELECT id FROM readings WHERE id = ?`)
    .get(result.reading_id);
  assert.ok(readingRow, "reading row should be stored even with partial failures");
});

test("runReading throws on empty vault", async () => {
  await assert.rejects(
    () => runReading({ client: mockClient(), mode: "test" }),
    /vault is empty/,
  );
});

test("Cache: second read with same snapshots + same model returns cached", async () => {
  seedSnapshots(2);
  const r1 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
  });
  assert.equal(r1.cached, false);

  const r2 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
  });
  assert.equal(r2.cached, true);
  assert.equal(r2.reading_id, r1.reading_id);
});

test("Cache: changing model invalidates cache (model is part of cache key)", async () => {
  seedSnapshots(2);
  const r1 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "model-a",
  });
  assert.equal(r1.cached, false);

  const r2 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "model-b",
  });
  assert.equal(r2.cached, false, "different model should produce fresh read");
  assert.notEqual(r2.reading_id, r1.reading_id);
});

test("Cache: archiving a snapshot invalidates cache (snapshot set changed)", async () => {
  const ids = seedSnapshots(3);
  const r1 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
  });
  assert.equal(r1.cached, false);

  archiveSnapshot(ids[0]);

  const r2 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
  });
  assert.equal(r2.cached, false, "archiving a snapshot should invalidate cache");
  assert.equal(r2.snapshot_count, 2);
});

test("Cache: useCache=false forces a fresh read even when cache exists", async () => {
  seedSnapshots(1);
  const r1 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
  });
  assert.equal(r1.cached, false);

  const r2 = await runReading({
    client: mockClient(),
    mode: "test",
    model: "test-model",
    useCache: false,
  });
  assert.equal(r2.cached, false);
  assert.notEqual(r2.reading_id, r1.reading_id);
});

test("All 12 agents failing: reading is still stored with empty agent_views", async () => {
  seedSnapshots(1);
  const result = await runReading({
    client: mockClient({ failAgentKeys: AGENT_KEYS }),
    mode: "test",
    model: "test-model",
  });
  assert.equal(result.agent_errors.length, 12);

  const db = openDb();
  const views = db
    .prepare(`SELECT COUNT(*) AS n FROM agent_views WHERE reading_id = ?`)
    .get(result.reading_id);
  assert.equal(views.n, 0, "no agent_views stored when all 12 agents fail");

  const reading = db
    .prepare(`SELECT id FROM readings WHERE id = ?`)
    .get(result.reading_id);
  assert.ok(reading, "reading row exists even with zero successful agents");
});

test("listActiveSnapshots respects archived flag", () => {
  const ids = seedSnapshots(3);
  assert.equal(listActiveSnapshots().length, 3);
  archiveSnapshot(ids[1]);
  assert.equal(listActiveSnapshots().length, 2);
  clearVault();
  assert.equal(listActiveSnapshots().length, 0);
});
