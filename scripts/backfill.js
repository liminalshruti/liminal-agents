#!/usr/bin/env node
/**
 * One-shot backfill: run a single ingest tick against every enabled real
 * source so the vault has data without waiting for the daemon's first poll.
 *
 * Use this after `npm run setup` to populate the vault from existing
 * Granola transcripts and Claude Code sessions immediately.
 */

import { openVault } from "../lib/vault/db.js";
import { ensureIntegrations } from "../lib/config/integrations.js";
import { log } from "../lib/log.js";
import * as claudeCode from "../lib/sources/claude-code.js";
import * as git from "../lib/sources/git.js";
import * as granola from "../lib/sources/granola.js";

const REAL_SOURCES = {
  "claude-code": claudeCode,
  git,
  granola,
};

const db = openVault();
const config = ensureIntegrations();
const now = Date.now();

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

console.log(JSON.stringify({ summary, vault_total: total, by_source: byKind }, null, 2));
db.close();
