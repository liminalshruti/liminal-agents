#!/usr/bin/env node
/**
 * Store the user's correction to a prior deliberation.
 *
 * Input: vault_id, agent_name (one of the twelve), reason string
 * Updates the SQLite row with correction_agent, correction_reason, correction_timestamp.
 *
 * The correction is the product. This script is what makes the vault accumulate
 * semantic deltas between AI reads and user experience.
 */

import Database from "better-sqlite3";
import path from "path";
import os from "os";

import { AGENT_NAMES } from "./agents.js";

const VAULT_PATH = path.join(os.homedir(), ".liminal-agents-vault.db");

const [vaultId, agent, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(" ");

if (!vaultId || !agent || !reason) {
  console.error(
    "Usage: store-correction.js <vault_id> <agent_name> <reason text>"
  );
  console.error('Example: store-correction.js abc-123 Witness "missed the compensatory move"');
  process.exit(1);
}

if (!AGENT_NAMES.includes(agent)) {
  console.error(
    `ERROR: agent must be one of ${AGENT_NAMES.join(", ")}. Got: ${agent}`
  );
  process.exit(1);
}

const db = new Database(VAULT_PATH);

// Verify the deliberation exists
const existing = db
  .prepare("SELECT id FROM deliberations WHERE id = ?")
  .get(vaultId);

if (!existing) {
  console.error(`ERROR: no deliberation found with id ${vaultId}`);
  process.exit(1);
}

db.prepare(
  `
  UPDATE deliberations
  SET correction_agent = ?,
      correction_reason = ?,
      correction_timestamp = ?
  WHERE id = ?
`
).run(agent, reason, Date.now(), vaultId);

console.log(
  JSON.stringify(
    {
      vault_id: vaultId,
      correction_stored: true,
      agent,
      reason,
    },
    null,
    2
  )
);
