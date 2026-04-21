#!/usr/bin/env node
/**
 * Orchestrator — twelve bounded agents deliberate on user state.
 *
 * Input: JSON string with q1, q2, q3 (A/B format)
 * Optional: second arg is user context string
 *
 * Output: JSON with vault_id, user_state, and views[] in registry order
 *
 * Calls Opus 4.7 via @anthropic-ai/sdk, runs agents in parallel,
 * stores baseline record in local SQLite.
 */

import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import crypto from "crypto";

import { AGENTS } from "./agents.js";

const VAULT_PATH = path.join(os.homedir(), ".liminal-agents-vault.db");

const API_KEY =
  process.env.ANTHROPIC_API_KEY ||
  process.env.CLAUDE_PLUGIN_OPTION_ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error(
    "ERROR: ANTHROPIC_API_KEY not set. Export it in your shell or configure the plugin."
  );
  process.exit(1);
}

const inputRaw = process.argv[2];
const userContext = process.argv[3] || null;

if (!inputRaw) {
  console.error("ERROR: missing input JSON. Expected: orchestrator.js '{\"q1\":\"A\",\"q2\":\"B\",\"q3\":\"A\"}'");
  process.exit(1);
}

let input;
try {
  input = JSON.parse(inputRaw);
} catch (e) {
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

const db = new Database(VAULT_PATH);
initSchema(db);

const vaultId = crypto.randomUUID();

const client = new Anthropic({ apiKey: API_KEY });

const agentPromises = AGENTS.map((agent) =>
  client.messages
    .create({
      model: "claude-opus-4-7",
      max_tokens: 200,
      temperature: 1.0,
      system: agent.system,
      messages: [{ role: "user", content: agent.task(userState, userContext) }],
    })
    .then((response) => {
      const text =
        response.content.find((block) => block.type === "text")?.text || "";
      return { name: agent.name, register: agent.register, interpretation: text.trim() };
    })
);

try {
  const results = await Promise.all(agentPromises);
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));

  const insertDeliberation = db.prepare(`
    INSERT INTO deliberations (id, timestamp, user_state, user_context, q1, q2, q3)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertView = db.prepare(`
    INSERT INTO agent_views (deliberation_id, agent_name, interpretation)
    VALUES (?, ?, ?)
  `);

  db.transaction(() => {
    insertDeliberation.run(
      vaultId,
      Date.now(),
      userState,
      userContext,
      q1.toUpperCase(),
      q2.toUpperCase(),
      q3.toUpperCase()
    );
    for (const agent of AGENTS) {
      const r = byName[agent.name];
      insertView.run(vaultId, agent.name, r?.interpretation || null);
    }
  })();

  const views = AGENTS.map((agent) => ({
    name: agent.name,
    register: agent.register,
    interpretation: byName[agent.name]?.interpretation || "",
  }));

  console.log(
    JSON.stringify(
      { vault_id: vaultId, user_state: userState, views },
      null,
      2
    )
  );
} catch (err) {
  console.error("ERROR calling Anthropic API:", err.message);
  process.exit(1);
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliberations (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      user_state TEXT NOT NULL,
      user_context TEXT,
      q1 TEXT NOT NULL,
      q2 TEXT NOT NULL,
      q3 TEXT NOT NULL,
      correction_agent TEXT,
      correction_reason TEXT,
      correction_timestamp INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_views (
      deliberation_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      interpretation TEXT,
      PRIMARY KEY (deliberation_id, agent_name)
    );
  `);

  const cols = db.prepare(`PRAGMA table_info(deliberations)`).all();
  const colNames = cols.map((c) => c.name);
  const legacy = ["architect_view", "witness_view", "contrarian_view"];
  const hasLegacy = legacy.some((c) => colNames.includes(c));
  if (!hasLegacy) return;

  const legacyAgents = [
    { col: "architect_view", name: "Architect" },
    { col: "witness_view", name: "Witness" },
    { col: "contrarian_view", name: "Contrarian" },
  ].filter((a) => colNames.includes(a.col));

  db.transaction(() => {
    for (const { col, name } of legacyAgents) {
      db.prepare(
        `INSERT OR IGNORE INTO agent_views (deliberation_id, agent_name, interpretation)
         SELECT id, ?, ${col} FROM deliberations WHERE ${col} IS NOT NULL`
      ).run(name);
    }

    db.exec(`
      CREATE TABLE deliberations_new (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        user_state TEXT NOT NULL,
        user_context TEXT,
        q1 TEXT NOT NULL,
        q2 TEXT NOT NULL,
        q3 TEXT NOT NULL,
        correction_agent TEXT,
        correction_reason TEXT,
        correction_timestamp INTEGER
      );
      INSERT INTO deliberations_new (
        id, timestamp, user_state, user_context, q1, q2, q3,
        correction_agent, correction_reason, correction_timestamp
      )
      SELECT id, timestamp, user_state, user_context, q1, q2, q3,
             correction_agent, correction_reason, correction_timestamp
      FROM deliberations;
      DROP TABLE deliberations;
      ALTER TABLE deliberations_new RENAME TO deliberations;
    `);
  })();
}
