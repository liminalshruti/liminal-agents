import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { makeTempVault, cleanupVault, writeLegacyVault } from "./helpers.js";
import { CORRECTION_TAGS, isValidTag } from "../lib/correction-tags.js";
import { AGENT_NAMES } from "../lib/agents/index.js";

test("vault init creates all four canonical tables", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
      .sort();
    for (const t of ["signal_events", "deliberations", "corrections", "surfacing_events"]) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("vault init copies JSON Schema files into the vault", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    db.close();
    const schemasDir = path.join(dir, "schemas");
    assert.ok(fs.existsSync(schemasDir), "schemas dir not created");
    const files = fs.readdirSync(schemasDir).sort();
    assert.deepEqual(files, [
      "correction.v1.json",
      "deliberation.v1.json",
      "signal.v1.json",
      "surfacing.v1.json",
    ]);
  } finally {
    cleanupVault(dir);
  }
});

test("legacy import moves v0.1 rows with vault_origin='legacy-import'", async () => {
  const dir = makeTempVault();
  const legacyHome = path.join(dir, "fake-home");
  process.env.HOME = legacyHome;
  const legacyPath = path.join(legacyHome, ".liminal-agents-vault.db");
  writeLegacyVault(legacyPath, [
    {
      id: "delib-1",
      timestamp: 1700000000000,
      user_state: "hyperfocused + raw + immediate",
      user_context: "launch prep",
      q1: "A",
      q2: "A",
      q3: "A",
      architect_view: "structural a",
      witness_view: "felt b",
      contrarian_view: "inverted c",
      correction_agent: "Witness",
      correction_reason: "missed the grief",
      correction_timestamp: 1700000060000,
    },
    {
      id: "delib-2",
      timestamp: 1700000100000,
      user_state: "scattered + defended + deferred",
      user_context: null,
      q1: "B",
      q2: "B",
      q3: "B",
      architect_view: "a2",
      witness_view: "b2",
      contrarian_view: "c2",
      correction_agent: null,
      correction_reason: null,
      correction_timestamp: null,
    },
  ]);

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    const delibs = db.prepare("SELECT * FROM deliberations ORDER BY id").all();
    assert.equal(delibs.length, 2);
    assert.equal(delibs[0].vault_origin, "legacy-import");
    assert.equal(delibs[0].trigger, "check");
    assert.equal(delibs[0].schema_version, 1);

    const corrs = db.prepare("SELECT * FROM corrections").all();
    assert.equal(corrs.length, 1, "only delib-1 had a correction");
    assert.equal(corrs[0].agent, "Witness");
    assert.equal(corrs[0].tag, null, "legacy corrections are tag-null");
    assert.equal(corrs[0].vault_origin, "legacy-import");

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("correction tag list has exactly nine tags and validates strictly", () => {
  assert.equal(CORRECTION_TAGS.length, 9);
  assert.ok(isValidTag("wrong_frame"));
  assert.ok(isValidTag("missed_compensation"));
  assert.ok(isValidTag(null), "null allowed for legacy rows");
  assert.equal(isValidTag("not_a_tag"), false);
});

test("agent names are the three bounded roles", () => {
  assert.deepEqual(AGENT_NAMES, ["Analyst", "SDR", "Auditor"]);
});

test("writing a correction via db enforces referential shape", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { newId } = await import("../lib/vault/ids.js");
    const db = openVault();

    const signalId = newId();
    db.prepare(
      `INSERT INTO signal_events (id, timestamp, source, kind, register, content, schema_version, vault_origin)
       VALUES (?, ?, 'user-check', 'check-response', 'inner', '{}', 1, 'native')`,
    ).run(signalId, Date.now());

    const delibId = newId();
    db.prepare(
      `INSERT INTO deliberations (id, timestamp, trigger, signal_ids, user_state, schema_version, vault_origin)
       VALUES (?, ?, 'check', ?, 'test', 1, 'native')`,
    ).run(delibId, Date.now(), JSON.stringify([signalId]));

    const corrId = newId();
    db.prepare(
      `INSERT INTO corrections (id, deliberation_id, timestamp, agent, tag, reason, schema_version, vault_origin)
       VALUES (?, ?, ?, 'Witness', 'wrong_frame', 'wrong lens', 1, 'native')`,
    ).run(corrId, delibId, Date.now());

    const row = db.prepare("SELECT * FROM corrections WHERE id = ?").get(corrId);
    assert.equal(row.agent, "Witness");
    assert.equal(row.tag, "wrong_frame");
    assert.equal(row.vault_origin, "native");

    db.close();
  } finally {
    cleanupVault(dir);
  }
});
