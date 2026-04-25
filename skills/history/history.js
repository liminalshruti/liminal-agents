#!/usr/bin/env node
/**
 * /history — read-only view of the vault.
 *
 * Prints a landed-vs-corrected matrix per agent and a breakdown of
 * correction tags. Writes nothing. Proves the central claim: the agents
 * do not converge; the record does.
 *
 * Usage: node skills/history/history.js [--since-days=<n>]
 */

import { openVault } from "../../lib/vault/db.js";
import { AGENT_NAMES } from "../../lib/agents/index.js";
import { CORRECTION_TAGS } from "../../lib/correction-tags.js";

const args = parseArgs(process.argv.slice(2));
const sinceDays = Number(args["since-days"]) || 0;
const sinceMs =
  sinceDays > 0 ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : 0;

const db = openVault();

const delibRows = db
  .prepare(
    `SELECT id, timestamp, trigger, vault_origin
     FROM deliberations
     WHERE timestamp >= ?
     ORDER BY timestamp DESC`,
  )
  .all(sinceMs);

const corrRows = db
  .prepare(
    `SELECT c.id, c.deliberation_id, c.timestamp, c.agent, c.tag, c.reason, c.vault_origin
     FROM corrections c
     JOIN deliberations d ON d.id = c.deliberation_id
     WHERE d.timestamp >= ?
     ORDER BY c.timestamp DESC`,
  )
  .all(sinceMs);

const correctionsByDelib = new Map();
for (const c of corrRows) {
  if (!correctionsByDelib.has(c.deliberation_id)) {
    correctionsByDelib.set(c.deliberation_id, []);
  }
  correctionsByDelib.get(c.deliberation_id).push(c);
}

const matrix = {};
for (const name of AGENT_NAMES) {
  matrix[name] = { landed: 0, corrected: 0, by_tag: zeroTagCounts() };
}

for (const d of delibRows) {
  const corrs = correctionsByDelib.get(d.id) || [];
  const correctedAgents = new Set(corrs.map((c) => c.agent));
  for (const name of AGENT_NAMES) {
    if (correctedAgents.has(name)) {
      matrix[name].corrected++;
    } else {
      matrix[name].landed++;
    }
  }
  for (const c of corrs) {
    if (c.tag && matrix[c.agent]?.by_tag[c.tag] !== undefined) {
      matrix[c.agent].by_tag[c.tag]++;
    }
  }
}

db.close();

const legacyCount = delibRows.filter(
  (d) => d.vault_origin === "legacy-import",
).length;

console.log(
  JSON.stringify(
    {
      since_days: sinceDays || "all",
      deliberations: delibRows.length,
      corrections: corrRows.length,
      legacy_imported: legacyCount,
      matrix,
      note: "the agents do not converge; the record does",
    },
    null,
    2,
  ),
);

function zeroTagCounts() {
  const o = {};
  for (const t of CORRECTION_TAGS) o[t] = 0;
  return o;
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
