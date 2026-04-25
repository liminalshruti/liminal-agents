import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3-multiple-ciphers";

// Fixed test key — never used outside the test harness. Tests set this
// env var so the keyguard short-circuits and never touches the real Keychain.
const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export function makeTempVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-test-"));
  process.env.LIMINAL_VAULT_DIR = dir;
  process.env.LIMINAL_VAULT_KEY = TEST_KEY_HEX;
  return dir;
}

export function cleanupVault(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.LIMINAL_VAULT_KEY;
}

export function writeLegacyVault(dbFilePath, rows = []) {
  // Mirror the v0.1 single-table schema the importer expects. Legacy DB is
  // plaintext; we open it without cipher pragmas.
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  if (fs.existsSync(dbFilePath)) fs.rmSync(dbFilePath);
  const db = new Database(dbFilePath);
  db.exec(`
    CREATE TABLE deliberations (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      user_state TEXT,
      user_context TEXT,
      q1 TEXT, q2 TEXT, q3 TEXT,
      architect_view TEXT,
      witness_view TEXT,
      contrarian_view TEXT,
      correction_agent TEXT,
      correction_reason TEXT,
      correction_timestamp INTEGER
    )
  `);
  const ins = db.prepare(`
    INSERT INTO deliberations
      (id, timestamp, user_state, user_context, q1, q2, q3,
       architect_view, witness_view, contrarian_view,
       correction_agent, correction_reason, correction_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    ins.run(
      r.id || crypto.randomUUID(),
      r.timestamp ?? Date.now(),
      r.user_state ?? null,
      r.user_context ?? null,
      r.q1 ?? null,
      r.q2 ?? null,
      r.q3 ?? null,
      r.architect_view ?? null,
      r.witness_view ?? null,
      r.contrarian_view ?? null,
      r.correction_agent ?? null,
      r.correction_reason ?? null,
      r.correction_timestamp ?? null,
    );
  }
  db.close();
}

export function writeJsonl(filePath, events) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}
