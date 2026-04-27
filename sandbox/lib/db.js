import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROD_DB_PATH = join(here, "..", "liminal-agency.db");

// DB path for the 12-agent agency surface. Uses a distinct filename
// (liminal-agency.db) from the legacy 3-agent sandbox DB, so both can
// coexist on disk if needed. No automatic migration happens — users with
// data in the older liminal.db must inspect or export it manually.
//
// The env-var lookup is dynamic (resolved on each openDb call) so tests can
// switch DBs between cases by mutating process.env.LIMINAL_DB + calling
// _resetDbForTests(). Production callers don't pass `path` and the env
// var is not normally set, so this resolves to PROD_DB_PATH.
function resolveDefaultDbPath() {
  return process.env.LIMINAL_DB || PROD_DB_PATH;
}

let _db = null;

const AGENT_KEYS_CHECK = "('analyst','researcher','forensic','sdr','closer','liaison','auditor','strategist','skeptic','operator','scheduler','bookkeeper')";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('meeting','decision','incident','paste')),
    text TEXT NOT NULL,
    label TEXT,
    archived INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS snapshots_timestamp ON snapshots(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS snapshots_active ON snapshots(archived, timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS readings (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    snapshot_ids TEXT NOT NULL,
    snapshot_ids_hash TEXT,
    snapshot_count INTEGER NOT NULL,
    signal_summary TEXT,
    threads TEXT,
    model TEXT,
    client_mode TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS readings_timestamp ON readings(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS readings_hash ON readings(snapshot_ids_hash)`,
  `CREATE TABLE IF NOT EXISTS agent_views (
    reading_id TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    agent_key TEXT NOT NULL CHECK (agent_key IN ${AGENT_KEYS_CHECK}),
    register TEXT NOT NULL,
    interpretation TEXT NOT NULL,
    PRIMARY KEY (reading_id, agent_key)
  )`,
  `CREATE INDEX IF NOT EXISTS agent_views_reading ON agent_views(reading_id)`,
  `CREATE INDEX IF NOT EXISTS agent_views_register ON agent_views(register)`,
  `CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    reading_id TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    agent TEXT NOT NULL CHECK (agent IN ${AGENT_KEYS_CHECK}),
    tag TEXT NOT NULL,
    note TEXT,
    timestamp INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS corrections_reading ON corrections(reading_id)`,
  `CREATE INDEX IF NOT EXISTS corrections_agent_tag ON corrections(agent, tag)`,
];

export function openDb(path = resolveDefaultDbPath()) {
  if (_db) return _db;
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const stmt of SCHEMA_STATEMENTS) db.prepare(stmt).run();
  _db = db;
  return db;
}

// Test-only helper: closes and clears the cached singleton so the next
// openDb() call opens a fresh connection (or a different path). Production
// code should never call this — the singleton is intentional.
export function _resetDbForTests() {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
}

export function newId() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}
