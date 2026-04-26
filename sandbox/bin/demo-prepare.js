#!/usr/bin/env node
// One-shot demo prep: clear the vault, ingest the past N days from real
// sources, run one reading, exit. Result lands in the cache so the TUI's
// first read at demo time is instant.
//
// Usage:
//   node bin/demo-prepare.js [--days=30] [--claude-count=30] [--sources=granola,claude-code] [--keep-existing]
//
// Defaults: 30 days, 30 most-recent claude sessions, both sources, vault wiped.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { clearVault, listActiveSnapshots, runReading } from "../lib/orchestrator.js";
import { readGranola } from "../lib/sources/granola.js";
import { readClaudeCode } from "../lib/sources/claude-code.js";
import { dropSnapshot } from "../lib/orchestrator.js";
import { makeClientOrExit } from "../lib/anthropic-client.js";

function parseFlags(argv) {
  const flags = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (a.startsWith("--")) flags[a.slice(2)] = "true";
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));
const days = Number(flags.days) || 30;
const claudeCount = Number(flags["claude-count"]) || 30;
const sources = (flags.sources || "granola,claude-code").split(",").map((s) => s.trim());
const keepExisting = flags["keep-existing"] === "true" || flags["keep-existing"] === "";

const t0 = Date.now();

if (!keepExisting) {
  clearVault();
  console.log("[1/3] vault cleared.");
} else {
  console.log("[1/3] keeping existing snapshots.");
}

let granolaCount = 0, claudeCodeCount = 0;

if (sources.includes("granola")) {
  const r = await readGranola({ days });
  for (const s of r.snapshots) {
    dropSnapshot({ kind: s.kind, text: s.text, label: s.label, timestamp: s.timestamp });
  }
  granolaCount = r.snapshots.length;
  console.log(`[2/3] granola: ${granolaCount} snapshots (mode=${r.stats.mode || "ok"})`);
}
if (sources.includes("claude-code")) {
  const r = await readClaudeCode({ days, count: claudeCount });
  for (const s of r.snapshots) {
    dropSnapshot({ kind: s.kind, text: s.text, label: s.label, timestamp: s.timestamp });
  }
  claudeCodeCount = r.snapshots.length;
  console.log(`[2/3] claude-code: ${claudeCodeCount} snapshots (skipped ${r.stats.skipped_no_user_message || 0} polluted)`);
}

const total = listActiveSnapshots().length;
console.log(`        vault total: ${total} active snapshots`);

if (total === 0) {
  console.error("vault is empty after ingest — nothing to read.");
  process.exit(1);
}

console.log(`[3/3] running first reading (this primes the cache; CLI mode ~3 min, API mode ~8 s)...`);
const { client, mode } = makeClientOrExit();
console.log(`        client mode: ${mode}`);

const tRead = Date.now();
const result = await runReading({ client, mode, useCache: false });
const elapsed = ((Date.now() - tRead) / 1000).toFixed(1);
console.log(`        read complete in ${elapsed}s · reading_id=${result.reading_id}`);

const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\ndemo prep complete in ${totalElapsed}s. The TUI's next /api/read will return instantly from cache.`);
console.log(`\n--- synthesis preview ---`);
console.log((result.signal_summary || "").split("\n").slice(0, 3).join("\n"));
console.log(`---`);
console.log(`threads: ${(result.threads || []).map((t) => t.label).join(" · ")}`);
