#!/usr/bin/env node
/**
 * /check orchestrator — twelve bounded introspective agents deliberate on user state.
 *
 * Usage: orchestrator.js '{"q1":"A","q2":"B","q3":"A"}' [optional context]
 * Writes:
 *   - one signal_event (user-check / inner)
 *   - one deliberation (trigger=check) with the 3 legacy columns populated
 *     for back-compat (Architect, Witness, Contrarian)
 *   - 12 agent_views rows, one per agent, normalized
 * Returns JSON with vault_id (deliberation id) + all 12 agent reads grouped
 * by register, plus the legacy 3-key shape for clients that haven't migrated.
 *
 * Agents never read prior corrections. System prompts never reference user history.
 */

import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import {
  runAllAgents,
  INTROSPECTIVE_AGENTS,
  INTROSPECTIVE_REGISTERS,
  introspectiveByRegister,
} from "../../lib/agents/index.js";
import { makeClientOrExit } from "../../lib/anthropic-client.js";

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
  const { client } = makeClientOrExit();
  // /check is the original Liminal substrate. Pass the introspective set
  // explicitly to prevent accidental drift to the agency set's B2B voice.
  // 12 agents fan out via Promise.allSettled — a single agent failure does
  // not lose the other 11's reads.
  const { byName, errors } = await runAllAgents(client, userState, userContext, {
    agents: INTROSPECTIVE_AGENTS,
  });

  if (errors.length > 0) {
    console.error(
      `[/check] ${errors.length}/${INTROSPECTIVE_AGENTS.length} agents failed; storing partial deliberation`,
    );
    for (const e of errors) {
      console.error(`  - ${e.agent_name}: ${e.reason}`);
    }
  }

  // Write all 12 to agent_views (normalized).
  const insertView = db.prepare(
    `INSERT OR REPLACE INTO agent_views (deliberation_id, agent_name, register, interpretation, schema_version)
     VALUES (?, ?, ?, ?, 1)`,
  );
  const tx = db.transaction(() => {
    for (const agent of INTROSPECTIVE_AGENTS) {
      const r = byName[agent.name];
      if (r && !r.error && r.interpretation) {
        insertView.run(deliberationId, agent.name, agent.register, r.interpretation);
      }
    }
  });
  tx();

  // Also write the legacy 3 columns for back-compat with anything still
  // reading deliberations.architect_view / witness_view / contrarian_view.
  db.prepare(
    `UPDATE deliberations SET architect_view = ?, witness_view = ?, contrarian_view = ? WHERE id = ?`,
  ).run(
    byName["Architect"]?.interpretation || null,
    byName["Witness"]?.interpretation || null,
    byName["Contrarian"]?.interpretation || null,
    deliberationId,
  );

  // Build the response: register-grouped reads + back-compat keys for the
  // original 3 (so any caller still reading byName["Architect"] keeps working).
  const grouped = introspectiveByRegister();
  const reads = {};
  for (const reg of INTROSPECTIVE_REGISTERS) {
    reads[reg] = grouped[reg].map((a) => ({
      name: a.name,
      register: a.register,
      interpretation: byName[a.name]?.interpretation || null,
      error: byName[a.name]?.error || false,
    }));
  }

  console.log(
    JSON.stringify(
      {
        vault_id: deliberationId,
        signal_id: signalId,
        user_state: userState,
        registers: reads,
        agent_errors: errors,
        // Back-compat: the legacy 3-key shape for clients that haven't migrated.
        architect: { interpretation: byName["Architect"]?.interpretation || null },
        witness: { interpretation: byName["Witness"]?.interpretation || null },
        contrarian: { interpretation: byName["Contrarian"]?.interpretation || null },
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("ERROR calling Anthropic API:", err.message);
  process.exit(1);
}
