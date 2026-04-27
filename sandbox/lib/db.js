import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = process.env.LIMINAL_DB || join(here, "..", "liminal.db");

let _db = null;

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
    architect_view TEXT,
    witness_view TEXT,
    contrarian_view TEXT,
    model TEXT,
    client_mode TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS readings_timestamp ON readings(timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    reading_id TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    agent TEXT NOT NULL CHECK (agent IN ('architect','witness','contrarian')),
    tag TEXT NOT NULL,
    note TEXT,
    timestamp INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS corrections_reading ON corrections(reading_id)`,
  `CREATE INDEX IF NOT EXISTS corrections_agent_tag ON corrections(agent, tag)`,
];

export function openDb(path = DEFAULT_DB_PATH) {
  if (_db) return _db;
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const stmt of SCHEMA_STATEMENTS) db.prepare(stmt).run();

  // Migrate existing DBs that pre-date the snapshot_ids_hash column, then
  // create the index unconditionally (covers both fresh and migrated DBs).
  const cols = db.prepare(`PRAGMA table_info(readings)`).all().map((r) => r.name);
  if (!cols.includes("snapshot_ids_hash")) {
    db.prepare(`ALTER TABLE readings ADD COLUMN snapshot_ids_hash TEXT`).run();
  }
  db.prepare(`CREATE INDEX IF NOT EXISTS readings_hash ON readings(snapshot_ids_hash)`).run();

  _db = db;
  return db;
}

export function newId() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}
