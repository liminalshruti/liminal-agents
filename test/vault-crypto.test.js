import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { makeTempVault, cleanupVault } from "./helpers.js";

test("on-disk vault file is encrypted (no SQLite plaintext header)", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { newId } = await import("../lib/vault/ids.js");
    const db = openVault();

    db.prepare(
      `INSERT INTO signal_events (id, timestamp, source, kind, register, content, schema_version, vault_origin)
       VALUES (?, ?, 'user-check', 'check-response', 'inner', ?, 1, 'native')`,
    ).run(
      newId(),
      Date.now(),
      JSON.stringify({ user_state: "MARKER_PLAINTEXT_SHOULD_NOT_APPEAR_ON_DISK" }),
    );
    db.close();

    const buf = fs.readFileSync(path.join(dir, "vault.db"));
    const headerMagic = Buffer.from("SQLite format 3");
    assert.equal(
      buf.subarray(0, headerMagic.length).equals(headerMagic),
      false,
      "encrypted vault must not start with the SQLite plaintext header",
    );
    assert.equal(
      buf.includes(Buffer.from("MARKER_PLAINTEXT_SHOULD_NOT_APPEAR_ON_DISK")),
      false,
      "row content must not appear plaintext on disk",
    );
  } finally {
    cleanupVault(dir);
  }
});

test("opening with the wrong key fails fast with SQLITE_NOTADB", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    db.close();

    process.env.LIMINAL_VAULT_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    const { openVault: openAgain } = await import(
      "../lib/vault/db.js?t=" + Date.now()
    );
    let caught;
    try {
      openAgain();
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "wrong key must throw");
    assert.equal(caught.code, "SQLITE_NOTADB");
  } finally {
    cleanupVault(dir);
  }
});

test("SQLCipher v4 profile is asserted (regression guard)", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    assert.equal(String(db.pragma("cipher", { simple: true })), "sqlcipher");
    assert.equal(String(db.pragma("legacy", { simple: true })), "4");
    assert.equal(String(db.pragma("kdf_iter", { simple: true })), "256000");
    assert.equal(String(db.pragma("hmac_algorithm", { simple: true })), "2");
    assert.equal(String(db.pragma("kdf_algorithm", { simple: true })), "2");
    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("rejects malformed env keys", async () => {
  const dir = makeTempVault();
  try {
    process.env.LIMINAL_VAULT_KEY = "tooshort";
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    let caught;
    try {
      openVault();
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "malformed key must throw");
    assert.match(caught.message, /vault key must be 64 hex/);
  } finally {
    cleanupVault(dir);
  }
});

test("migrate-encrypt converts a plaintext vault.db to SQLCipher v4", async () => {
  const dir = makeTempVault();
  try {
    const dbPath = path.join(dir, "vault.db");
    // Write a plaintext vault.db with one signal_event row.
    const plain = new Database(dbPath);
    plain.exec(`
      CREATE TABLE signal_events (
        id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL,
        source TEXT NOT NULL, kind TEXT NOT NULL, register TEXT NOT NULL,
        thread_id TEXT, content TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        vault_origin TEXT NOT NULL DEFAULT 'native'
      );
      INSERT INTO signal_events (id, timestamp, source, kind, register, content)
        VALUES ('row-1', 1700000000000, 'git', 'commit', 'operational', '{"sha":"abc"}');
    `);
    plain.close();

    // Confirm starting state is plaintext.
    const head = fs.readFileSync(dbPath).subarray(0, 15).toString("utf8");
    assert.equal(head, "SQLite format 3");

    const { migrateToEncrypted, isPlaintextSqlite } = await import(
      "../scripts/migrate-encrypt.js?t=" + Date.now()
    );
    const result = migrateToEncrypted();
    assert.equal(result.migrated, true);
    assert.equal(isPlaintextSqlite(dbPath), false);

    // Reopen via openVault — same env key, must read the migrated row.
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    const row = db.prepare("SELECT * FROM signal_events WHERE id = ?").get("row-1");
    assert.equal(row.source, "git");
    db.close();

    // Idempotent — second run reports already_encrypted.
    const second = migrateToEncrypted();
    assert.equal(second.migrated, false);
    assert.equal(second.reason, "already_encrypted");
  } finally {
    cleanupVault(dir);
  }
});

test("legacy plaintext vault is imported into the encrypted store", async () => {
  const dir = makeTempVault();
  const fakeHome = path.join(dir, "fake-home");
  fs.mkdirSync(fakeHome, { recursive: true });
  process.env.HOME = fakeHome;

  const legacyPath = path.join(fakeHome, ".liminal-agents-vault.db");
  const legacy = new Database(legacyPath);
  legacy.exec(`
    CREATE TABLE deliberations (
      id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, user_state TEXT,
      user_context TEXT, q1 TEXT, q2 TEXT, q3 TEXT,
      architect_view TEXT, witness_view TEXT, contrarian_view TEXT,
      correction_agent TEXT, correction_reason TEXT, correction_timestamp INTEGER
    );
    INSERT INTO deliberations (id, timestamp, user_state) VALUES ('legacy-1', 1700000000000, 'imported state');
  `);
  legacy.close();

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const db = openVault();
    const rows = db.prepare("SELECT * FROM deliberations").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "legacy-1");
    assert.equal(rows[0].vault_origin, "legacy-import");
    db.close();
  } finally {
    cleanupVault(dir);
  }
});
