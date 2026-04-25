#!/usr/bin/env node
/**
 * One-shot backfill: run a single ingest tick against every enabled real
 * source so the vault has data without waiting for the daemon's first poll.
 *
 * Use this after `npm run setup` to populate the vault from existing
 * Granola transcripts and Claude Code sessions immediately.
 *
 * Pass `--dry-run` to see what would be ingested without committing the
 * writes. Useful for inspecting a vault target before committing personal
 * meeting content (see SPEC §4.2 — demo seeding workflow).
 */

import fs from "node:fs";
import path from "node:path";
import { openVault } from "../lib/vault/db.js";
import { ensureIntegrations } from "../lib/config/integrations.js";
import { integrationsCacheDir } from "../lib/vault/path.js";
import { log } from "../lib/log.js";
import * as claudeCode from "../lib/sources/claude-code.js";
import * as git from "../lib/sources/git.js";
import * as granola from "../lib/sources/granola.js";

const REAL_SOURCES = {
  "claude-code": claudeCode,
  git,
  granola,
};

const dryRun = process.argv.includes("--dry-run");

// Cursors live in JSON files outside the SQLite transaction, so a SQL rollback
// alone wouldn't make the dry-run side-effect-free — the next real run would
// see an advanced cursor and skip everything. Snapshot the cursor file
// (or its absence) per source and restore at the end.
function snapshotCursors(sourceNames) {
  const snap = {};
  for (const name of sourceNames) {
    const p = path.join(integrationsCacheDir(name), "cursor.json");
    snap[name] = fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
  return snap;
}

function restoreCursors(snap) {
  for (const [name, content] of Object.entries(snap)) {
    const p = path.join(integrationsCacheDir(name), "cursor.json");
    if (content === null) {
      if (fs.existsSync(p)) fs.rmSync(p);
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
  }
}

const db = openVault();
const config = ensureIntegrations();
const now = Date.now();

const cursorSnapshot = dryRun ? snapshotCursors(Object.keys(REAL_SOURCES)) : null;
if (dryRun) db.prepare("BEGIN").run();

const summary = {};
for (const [name, mod] of Object.entries(REAL_SOURCES)) {
  const src = config.sources?.[name];
  if (!src?.enabled) {
    summary[name] = { skipped: "disabled" };
    continue;
  }
  try {
    const result = await mod.ingest({ db, config: src, now, log });
    summary[name] = result;
  } catch (err) {
    summary[name] = { error: err.message };
  }
}

const total = db.prepare("SELECT COUNT(*) AS c FROM signal_events").get().c;
const byKind = db
  .prepare("SELECT source, COUNT(*) AS c FROM signal_events GROUP BY source")
  .all();

if (dryRun) {
  db.prepare("ROLLBACK").run();
  restoreCursors(cursorSnapshot);
}

console.log(
  JSON.stringify(
    { dry_run: dryRun, summary, vault_total: total, by_source: byKind },
    null,
    2,
  ),
);
db.close();
