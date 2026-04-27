#!/usr/bin/env node
import { dropSnapshot, clearVault, listActiveSnapshots } from "../lib/orchestrator.js";
import { readClaudeCode } from "../lib/sources/claude-code.js";
import { readGranola } from "../lib/sources/granola.js";

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
const sources = (flags.sources || "granola,claude-code").split(",").map((s) => s.trim()).filter(Boolean);
const shouldClear = flags.clear === "true" || flags.clear === "";

if (shouldClear) {
  clearVault();
  console.log(`vault cleared.`);
}

const sourceResults = {};

if (sources.includes("granola")) {
  console.log(`granola: reading past ${days} days...`);
  const t0 = Date.now();
  const r = await readGranola({ days });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  for (const s of r.snapshots) {
    dropSnapshot({ kind: s.kind, text: s.text, label: s.label, timestamp: s.timestamp });
  }
  sourceResults.granola = { ...r.stats, ingested: r.snapshots.length, elapsed_s: elapsed };
  console.log(`  ${r.snapshots.length} snapshots in ${elapsed}s · stats: ${JSON.stringify(r.stats)}`);
}

if (sources.includes("claude-code")) {
  console.log(`claude-code: reading last ${claudeCount} sessions in past ${days} days...`);
  const t0 = Date.now();
  const r = await readClaudeCode({ days, count: claudeCount });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  for (const s of r.snapshots) {
    dropSnapshot({ kind: s.kind, text: s.text, label: s.label, timestamp: s.timestamp });
  }
  sourceResults["claude-code"] = { ...r.stats, ingested: r.snapshots.length, elapsed_s: elapsed };
  console.log(`  ${r.snapshots.length} snapshots in ${elapsed}s · stats: ${JSON.stringify(r.stats)}`);
}

const total = listActiveSnapshots().length;
console.log(`\nvault total: ${total} active snapshots`);
console.log(JSON.stringify({ sources: sourceResults, vault_total: total }, null, 2));
