#!/usr/bin/env node
/**
 * Store a correction against a prior deliberation.
 *
 * Usage: store-correction.js <vault_id> <agent_name> <tag> <reason...>
 * Writes: one row in `corrections`. Tag must be one of the canonical taxonomy.
 */

import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import { CORRECTION_TAGS, isValidTag } from "../../lib/correction-tags.js";
import { AGENT_NAMES } from "../../lib/agents/index.js";

const [vaultId, agent, tag, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(" ");

if (!vaultId || !agent || !tag || !reason) {
  console.error(
    "Usage: store-correction.js <vault_id> <agent_name> <tag> <reason text>",
  );
  console.error(`  valid agents: ${AGENT_NAMES.join(", ")}`);
  console.error(`  valid tags:   ${CORRECTION_TAGS.join(", ")}`);
  process.exit(1);
}

if (!AGENT_NAMES.includes(agent)) {
  console.error(
    `ERROR: agent must be one of ${AGENT_NAMES.join(", ")}. Got: ${agent}`,
  );
  process.exit(1);
}

if (!isValidTag(tag) || tag == null) {
  console.error(
    `ERROR: tag must be one of ${CORRECTION_TAGS.join(", ")}. Got: ${tag}`,
  );
  process.exit(1);
}

const db = openVault();

const existing = db
  .prepare("SELECT id FROM deliberations WHERE id = ?")
  .get(vaultId);

if (!existing) {
  console.error(`ERROR: no deliberation found with id ${vaultId}`);
  process.exit(1);
}

const correctionId = newId();
db.prepare(
  `INSERT INTO corrections (id, deliberation_id, timestamp, agent, tag, reason, schema_version, vault_origin)
   VALUES (?, ?, ?, ?, ?, ?, 1, 'native')`,
).run(correctionId, vaultId, Date.now(), agent, tag, reason);

console.log(
  JSON.stringify(
    {
      correction_id: correctionId,
      vault_id: vaultId,
      agent,
      tag,
      reason,
    },
    null,
    2,
  ),
);
