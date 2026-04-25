#!/usr/bin/env node
/**
 * /check orchestrator — three bounded agents deliberate on user state.
 *
 * Usage: orchestrator.js '{"q1":"A","q2":"B","q3":"A"}' [optional context]
 * Writes: one signal_event (user-check / inner), one deliberation (trigger=check).
 * Returns JSON with vault_id (deliberation id) and the three agent reads.
 *
 * Agents never read prior corrections. System prompts never reference user history.
 */

import Anthropic from "@anthropic-ai/sdk";
import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import { runAllAgents } from "../../lib/agents/index.js";

const API_KEY =
  process.env.ANTHROPIC_API_KEY ||
  process.env.CLAUDE_PLUGIN_OPTION_ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error(
    "ERROR: ANTHROPIC_API_KEY not set. Export it in your shell or configure the plugin.",
  );
  process.exit(1);
}

const inputRaw = process.argv[2];
const userContext = process.argv[3] || null;

if (!inputRaw) {
  console.error(
    "ERROR: missing input JSON. Expected: orchestrator.js '{\"q1\":\"A\",\"q2\":\"B\",\"q3\":\"A\"}'",
  );
  process.exit(1);
}

let input;
try {
  input = JSON.parse(inputRaw);
} catch {
  console.error("ERROR: input is not valid JSON:", inputRaw);
  process.exit(1);
}

const { q1, q2, q3 } = input;
if (!q1 || !q2 || !q3) {
  console.error("ERROR: need q1, q2, q3 in input JSON");
  process.exit(1);
}

const frames = {
  q1: { A: "hyperfocused attention", B: "scattered attention" },
  q2: { A: "raw emotional register", B: "defended emotional register" },
  q3: { A: "immediate time horizon", B: "deferred time horizon" },
};

const userState = [
  frames.q1[q1?.toUpperCase()],
  frames.q2[q2?.toUpperCase()],
  frames.q3[q3?.toUpperCase()],
]
  .filter(Boolean)
  .join(" + ");

if (userState.split(" + ").length !== 3) {
  console.error("ERROR: could not parse all three answers. Got:", input);
  process.exit(1);
}

const db = openVault();
const now = Date.now();

const signalId = newId();
db.prepare(
  `INSERT INTO signal_events (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
   VALUES (?, ?, 'user-check', 'check-response', 'inner', NULL, ?, 1, 'native')`,
).run(
  signalId,
  now,
  JSON.stringify({
    q1: q1.toUpperCase(),
    q2: q2.toUpperCase(),
    q3: q3.toUpperCase(),
    user_state: userState,
    user_context: userContext,
  }),
);

const deliberationId = newId();
db.prepare(
  `INSERT INTO deliberations (id, timestamp, trigger, signal_ids, user_state, user_context,
     architect_view, witness_view, contrarian_view, schema_version, vault_origin)
   VALUES (?, ?, 'check', ?, ?, ?, NULL, NULL, NULL, 1, 'native')`,
).run(
  deliberationId,
  now,
  JSON.stringify([signalId]),
  userState,
  userContext,
);

try {
  const client = new Anthropic({ apiKey: API_KEY });
  const byName = await runAllAgents(client, userState, userContext);

  db.prepare(
    `UPDATE deliberations SET architect_view = ?, witness_view = ?, contrarian_view = ? WHERE id = ?`,
  ).run(
    byName["Architect"] || null,
    byName["Witness"] || null,
    byName["Contrarian"] || null,
    deliberationId,
  );

  console.log(
    JSON.stringify(
      {
        vault_id: deliberationId,
        signal_id: signalId,
        user_state: userState,
        architect: { interpretation: byName["Architect"] },
        witness: { interpretation: byName["Witness"] },
        contrarian: { interpretation: byName["Contrarian"] },
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("ERROR calling Anthropic API:", err.message);
  process.exit(1);
}
