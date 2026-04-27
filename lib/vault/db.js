import fs from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { vaultDir, vaultDbPath, legacyVaultPath } from "./path.js";
import { copySchemas } from "./schemas.js";
import { newId } from "./ids.js";
import { applyCipherPragmas, assertProfile, zeroize } from "./crypto.js";
import { unwrapKey, initKey } from "./keyguard.js";
import { secureErase } from "./secure-erase.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS signal_events (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    kind TEXT NOT NULL,
    register TEXT NOT NULL,
    thread_id TEXT,
    content TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    vault_origin TEXT NOT NULL DEFAULT 'native'
  );
  CREATE TABLE IF NOT EXISTS deliberations (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    signal_ids TEXT,
    user_state TEXT,
    user_context TEXT,
    architect_view TEXT,
    witness_view TEXT,
    contrarian_view TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    vault_origin TEXT NOT NULL DEFAULT 'native'
  );
  -- Normalized agent_views table for the 12-agent introspective set.
  -- The 3 legacy columns above (architect_view, witness_view, contrarian_view)
  -- are preserved for backward compatibility and are still written to by
  -- the /check orchestrator for the original 3 agents. The other 9 agents
  -- (Strategist, Economist, Physician, Child, Historian, Cartographer, Elder,
  -- Mystic, Betrayer) only land in agent_views.
  CREATE TABLE IF NOT EXISTS agent_views (
    deliberation_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    register TEXT NOT NULL,
    interpretation TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (deliberation_id, agent_name)
  );
  CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    deliberation_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    agent TEXT NOT NULL,
    tag TEXT,
    reason TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    vault_origin TEXT NOT NULL DEFAULT 'native'
  );
  CREATE TABLE IF NOT EXISTS surfacing_events (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT,
    deliberation_id TEXT,
    schema_version INTEGER NOT NULL DEFAULT 1,
    vault_origin TEXT NOT NULL DEFAULT 'native'
  );
  CREATE INDEX IF NOT EXISTS idx_signal_events_timestamp ON signal_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_signal_events_thread    ON signal_events(thread_id);
  CREATE INDEX IF NOT EXISTS idx_deliberations_timestamp ON deliberations(timestamp);
  CREATE INDEX IF NOT EXISTS idx_corrections_delib       ON corrections(deliberation_id);
  CREATE INDEX IF NOT EXISTS idx_surfacing_timestamp     ON surfacing_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_agent_views_delib       ON agent_views(deliberation_id);
  CREATE INDEX IF NOT EXISTS idx_agent_views_agent       ON agent_views(agent_name);
`;

export function openVault() {
  const dir = vaultDir();
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = vaultDbPath();
  const isNew = !fs.existsSync(dbPath);

  const release = isNew ? initKey() : unwrapKey();
  const db = new Database(dbPath);
  try {
    applyCipherPragmas(db, release.key);
  } finally {
    zeroize(release.key);
  }

  // Validate the key by touching user_version. Wrong key throws SQLITE_NOTADB.
  db.pragma("user_version");
  assertProfile(db);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  try {
    copySchemas(dir);
  } catch {
    // schemas dir missing in dev — tolerate, daemon also runs copySchemas
  }
  if (isNew) importLegacyIfPresent(db);
  return db;
}

export function importLegacyIfPresent(db) {
  const legacyPath = legacyVaultPath();
  if (!fs.existsSync(legacyPath)) return { imported: 0 };
  // Legacy DB is plaintext better-sqlite3, opened without cipher pragmas.
  const legacy = new Database(legacyPath, { readonly: true, fileMustExist: true });
  let count = 0;
  try {
    const hasTable = legacy
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deliberations'")
      .get();
    if (!hasTable) {
      legacy.close();
      return { imported: 0 };
    }
    const rows = legacy.prepare("SELECT * FROM deliberations").all();
    const insertDelib = db.prepare(`
      INSERT OR IGNORE INTO deliberations (
        id, timestamp, trigger, signal_ids, user_state, user_context,
        architect_view, witness_view, contrarian_view,
        schema_version, vault_origin
      ) VALUES (?, ?, 'check', NULL, ?, ?, ?, ?, ?, 1, 'legacy-import')
    `);
    const insertCorr = db.prepare(`
      INSERT OR IGNORE INTO corrections (
        id, deliberation_id, timestamp, agent, tag, reason, schema_version, vault_origin
      ) VALUES (?, ?, ?, ?, NULL, ?, 1, 'legacy-import')
    `);
    const tx = db.transaction(() => {
      for (const r of rows) {
        insertDelib.run(
          r.id,
          r.timestamp,
          r.user_state ?? null,
          r.user_context ?? null,
          r.architect_view ?? null,
          r.witness_view ?? null,
          r.contrarian_view ?? null,
        );
        if (r.correction_agent && r.correction_reason) {
          insertCorr.run(
            newId(),
            r.id,
            r.correction_timestamp ?? r.timestamp,
            r.correction_agent,
            r.correction_reason,
          );
        }
        count++;
      }
    });
    tx();
    legacy.close();
    // Secure-overwrite the plaintext source after a successful import.
    secureErase(legacyPath);
    return { imported: count, legacy_erased: true };
  } catch (err) {
    legacy.close();
    throw err;
  }
}
