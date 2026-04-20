#!/usr/bin/env node
/**
 * Orchestrator — three bounded agents deliberate on user state.
 *
 * Input: JSON string with q1, q2, q3 (A/B format)
 * Optional: second arg is user context string
 *
 * Output: JSON with vault_id and three agent interpretations
 *
 * Calls Opus 4.7 via @anthropic-ai/sdk, runs agents in parallel,
 * stores baseline record in local SQLite.
 */

import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import crypto from "crypto";

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

// Map A/B answers to semantic frames
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

// Initialize vault
const db = new Database(VAULT_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS deliberations (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    user_state TEXT NOT NULL,
    user_context TEXT,
    q1 TEXT NOT NULL,
    q2 TEXT NOT NULL,
    q3 TEXT NOT NULL,
    architect_view TEXT,
    witness_view TEXT,
    contrarian_view TEXT,
    correction_agent TEXT,
    correction_reason TEXT,
    correction_timestamp INTEGER
  )
`);

const vaultId = crypto.randomUUID();

// Three bounded agents with jurisdiction
const agents = [
  {
    name: "Architect",
    system:
      "You are the Architect. Your domain: structure, pattern, system constraint. Your anti-domain: felt experience, somatic signal, relational texture. When you read someone's state, you name the structural pattern driving it. You speak in 1-2 sentences. You do not hedge.",
    task: (state, context) =>
      `State: ${state}.${context ? ` Context: ${context}.` : ""} What structural pattern is producing this state? Name it, then name what needs to change structurally. One to two sentences.`,
  },
  {
    name: "Witness",
    system:
      "You are the Witness. Your domain: what is being felt, what is being held, what is present in the body. Your anti-domain: strategy, system design, productivity. When you read someone's state, you name the felt experience underneath the words. You speak in 1-2 sentences. You do not solve.",
    task: (state, context) =>
      `State: ${state}.${context ? ` Context: ${context}.` : ""} What is being felt here that the structural story is missing? Name the embodied experience. One to two sentences.`,
  },
  {
    name: "Contrarian",
    system:
      "You are the Contrarian. Your domain: inversion, dangerous questions, what everyone is missing. Your anti-domain: consensus, comfort, safety. When you read someone's state, you invert the obvious reading. You speak in 1-2 sentences. You say the thing the other agents cannot.",
    task: (state, context) =>
      `State: ${state}.${context ? ` Context: ${context}.` : ""} What is the opposite of what the Architect and Witness will say? What are they both missing? One to two sentences.`,
  },
];

const client = new Anthropic({ apiKey: API_KEY });

// Run three agents in parallel
const agentPromises = agents.map((agent) =>
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
      return { name: agent.name, interpretation: text.trim() };
    })
);

try {
  const results = await Promise.all(agentPromises);

  const byName = {};
  for (const r of results) byName[r.name] = r.interpretation;

  // Store baseline (no correction yet)
  db.prepare(
    `
    INSERT INTO deliberations (
      id, timestamp, user_state, user_context, q1, q2, q3,
      architect_view, witness_view, contrarian_view
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    vaultId,
    Date.now(),
    userState,
    userContext,
    q1.toUpperCase(),
    q2.toUpperCase(),
    q3.toUpperCase(),
    byName["Architect"] || null,
    byName["Witness"] || null,
    byName["Contrarian"] || null
  );

  // Return JSON for Claude to present
  console.log(
    JSON.stringify(
      {
        vault_id: vaultId,
        user_state: userState,
        architect: { interpretation: byName["Architect"] },
        witness: { interpretation: byName["Witness"] },
        contrarian: { interpretation: byName["Contrarian"] },
      },
      null,
      2
    )
  );
} catch (err) {
  console.error("ERROR calling Anthropic API:", err.message);
  process.exit(1);
}
