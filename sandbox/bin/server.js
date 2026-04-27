#!/usr/bin/env node
import { Hono } from "hono";
import { serve } from "@hono/node-server";

import { makeClient } from "../lib/anthropic-client.js";
import { openDb, newId } from "../lib/db.js";
import { CORRECTION_TAGS, CORRECTION_TAG_DESCRIPTIONS, isValidTag } from "../lib/correction-tags.js";
import {
  dropSnapshot,
  listActiveSnapshots,
  archiveSnapshot,
  clearVault,
  runReading,
} from "../lib/orchestrator.js";
import { seedDemoVault } from "../lib/seed.js";
import { AGENT_KEYS, REGISTERS, agentsByRegister } from "../lib/agents/index.js";
import { retrieveAll, retrieveSnapshots, retrieveCorrections } from "../lib/retrieve.js";
import { refineAgentRead, getRefinementChain } from "../lib/refine.js";

const app = new Hono();

// CORS for the TUI (or any external client) running on a different origin.
app.use("/*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "content-type");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, service: "liminal-sandbox", version: "0.1.0" }));

app.get("/api/tags", (c) => c.json({
  tags: CORRECTION_TAGS,
  descriptions: CORRECTION_TAG_DESCRIPTIONS,
}));

// ── Snapshots ──────────────────────────────────────────────────────────────
app.get("/api/snapshots", (c) => c.json({ snapshots: listActiveSnapshots() }));

app.post("/api/snapshots", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const s = dropSnapshot({ kind: body.kind, text: body.text, label: body.label || null });
    return c.json({ ok: true, snapshot: s });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

app.delete("/api/snapshots/:id", (c) => c.json({ ok: archiveSnapshot(c.req.param("id")) }));

app.post("/api/snapshots/clear", (c) => { clearVault(); return c.json({ ok: true }); });

app.post("/api/seed", (c) => {
  clearVault();
  const seeded = seedDemoVault();
  return c.json({ ok: true, count: seeded.length });
});

// ── Readings ───────────────────────────────────────────────────────────────
app.post("/api/read", async (c) => {
  const { client, mode } = makeClient();
  if (!client) {
    return c.json({
      error: "no Anthropic credential found",
      remediation: "set ANTHROPIC_API_KEY or run `claude setup-token`",
    }, 401);
  }
  try {
    const result = await runReading({ client, mode });
    return c.json(result);
  } catch (e) {
    console.error(`[/api/read] ${e.message}`);
    const isVaultEmpty = /vault is empty/.test(e.message);
    const isAuthError = /401|403|API key|authentication/i.test(e.message);
    let remediation = "check server logs for synthesis or agent errors";
    if (isVaultEmpty) remediation = "POST /api/snapshot to add at least one snapshot before reading";
    else if (isAuthError) remediation = "verify your ANTHROPIC_API_KEY or rerun `claude setup-token`";
    return c.json({
      error: `read failed: ${e.message}`,
      remediation,
    }, isVaultEmpty ? 400 : isAuthError ? 401 : 500);
  }
});

app.get("/api/readings", (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 25), 100);
  const db = openDb();
  const rows = db.prepare(
    `SELECT id, timestamp, snapshot_count, signal_summary, model, client_mode
     FROM readings ORDER BY timestamp DESC LIMIT ?`,
  ).all(limit);
  return c.json({ readings: rows });
});

app.get("/api/readings/:id", (c) => {
  const id = c.req.param("id");
  const db = openDb();
  const row = db.prepare(`SELECT * FROM readings WHERE id = ?`).get(id);
  if (!row) return c.json({ error: "reading not found", reading_id: id }, 404);
  const corrections = db.prepare(
    `SELECT id, agent, tag, note, timestamp FROM corrections WHERE reading_id = ? ORDER BY timestamp ASC`,
  ).all(id);
  // Log on JSON parse failure rather than silently producing empty arrays —
  // a corrupted reading should be visible to a debugger, not invisible.
  let snapshotIds = [];
  let threads = [];
  try {
    snapshotIds = JSON.parse(row.snapshot_ids);
  } catch (e) {
    console.warn(`[/api/readings/${id}] snapshot_ids JSON parse failed: ${e.message}`);
  }
  try {
    threads = JSON.parse(row.threads);
  } catch (e) {
    console.warn(`[/api/readings/${id}] threads JSON parse failed: ${e.message}`);
  }
  const viewRows = db.prepare(
    `SELECT agent_key, register, interpretation FROM agent_views WHERE reading_id = ?`,
  ).all(id);
  const agents = {};
  for (const v of viewRows) {
    agents[v.agent_key] = { key: v.agent_key, register: v.register, interpretation: v.interpretation };
  }
  return c.json({
    reading_id: row.id,
    timestamp: row.timestamp,
    snapshot_count: row.snapshot_count,
    snapshot_ids: snapshotIds,
    signal_summary: row.signal_summary,
    threads,
    agents,
    model: row.model,
    client_mode: row.client_mode,
    corrections,
  });
});

// ── Corrections ────────────────────────────────────────────────────────────
app.post("/api/correction", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { reading_id, agent, tag, note } = body;
  if (!reading_id || !agent || !tag) {
    return c.json({
      error: "need reading_id, agent, tag",
      required: ["reading_id", "agent", "tag"],
      optional: ["note"],
    }, 400);
  }
  if (!AGENT_KEYS.includes(agent)) {
    return c.json({
      error: `agent must be one of the 12 canonical agent keys`,
      received: agent,
      valid_agents: AGENT_KEYS,
    }, 400);
  }
  if (!isValidTag(tag)) {
    return c.json({
      error: "invalid correction tag",
      received: tag,
      valid_tags: CORRECTION_TAGS,
    }, 400);
  }
  const db = openDb();
  const exists = db.prepare(`SELECT 1 FROM readings WHERE id = ?`).get(reading_id);
  if (!exists) {
    return c.json({ error: "reading not found", reading_id }, 404);
  }

  const id = newId();
  try {
    db.prepare(
      `INSERT INTO corrections (id, reading_id, agent, tag, note, timestamp) VALUES (?,?,?,?,?,?)`,
    ).run(id, reading_id, agent, tag, note || null, Date.now());
  } catch (e) {
    console.error(`[/api/correction] insert failed: ${e.message}`);
    return c.json({
      error: `correction insert failed: ${e.message.split("\n")[0]}`,
      remediation: "check server logs",
    }, 500);
  }

  return c.json({ ok: true, correction_id: id });
});

// ── Refinement (bounded re-read of a single agent) ────────────────────────
// POST /api/refine { reading_id, agent_key, refinement, parent_refined_id? }
//   Re-runs ONE agent on the same synthesis with extra user-provided context.
//   Other agents are NOT consulted — bounded multi-agent claim preserved.
//   parent_refined_id chains refinements: pass the previous refined_id to
//   continue the same agent's iteration.
app.post("/api/refine", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { reading_id, agent_key, refinement, parent_refined_id = null } = body;
  if (!reading_id || !agent_key || !refinement) {
    return c.json({
      error: "need reading_id, agent_key, refinement",
      required: ["reading_id", "agent_key", "refinement"],
      optional: ["parent_refined_id"],
    }, 400);
  }
  if (!AGENT_KEYS.includes(agent_key)) {
    return c.json({
      error: "agent_key must be one of the 12 canonical agent keys",
      received: agent_key,
      valid_agents: AGENT_KEYS,
    }, 400);
  }
  const { client, mode } = makeClient();
  if (!client) {
    return c.json({
      error: "no Anthropic credential found",
      remediation: "set ANTHROPIC_API_KEY or run `claude setup-token`",
    }, 401);
  }
  try {
    const result = await refineAgentRead({
      client,
      readingId: reading_id,
      agentKey: agent_key,
      refinement,
      parentRefinedId: parent_refined_id,
    });
    return c.json({ ok: true, ...result, client_mode: mode });
  } catch (e) {
    console.error(`[/api/refine] ${e.message}`);
    const status = /not found/.test(e.message) ? 404 : 400;
    return c.json({ error: e.message }, status);
  }
});

// GET /api/refinements/:reading_id/:agent_key — list the refinement chain
// for a (reading, agent), oldest first.
app.get("/api/refinements/:reading_id/:agent_key", (c) => {
  const reading_id = c.req.param("reading_id");
  const agent_key = c.req.param("agent_key");
  if (!AGENT_KEYS.includes(agent_key)) {
    return c.json({ error: "invalid agent_key", valid_agents: AGENT_KEYS }, 400);
  }
  const chain = getRefinementChain(reading_id, agent_key);
  return c.json({ reading_id, agent_key, refinements: chain });
});

// ── Retrieval (FTS5 over snapshots + corrections) ──────────────────────────
// POST /api/retrieve { query, limit?, kind?, agent?, tag?, raw? }
//   - kind: "snapshots" | "corrections" | "all" (default "all")
//   - limit: 1-50 (default 10)
//   - agent: filter corrections by agent_key (optional)
//   - tag: filter corrections by tag (optional)
//   - raw: pass query unsanitized to FTS5 (advanced — boolean operators etc.)
app.post("/api/retrieve", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { query, limit = 10, kind = "all", agent = null, tag = null, raw = false } = body;
  if (!query || typeof query !== "string" || !query.trim()) {
    return c.json({
      error: "query is required",
      example: { query: "customer escalation", limit: 5, kind: "snapshots" },
    }, 400);
  }
  const opts = { limit, raw };
  let result = {};
  if (kind === "snapshots") {
    result = { snapshots: retrieveSnapshots(query, opts) };
  } else if (kind === "corrections") {
    result = { corrections: retrieveCorrections(query, { ...opts, agentKey: agent, tag }) };
  } else if (kind === "all") {
    result = retrieveAll(query, opts);
  } else {
    return c.json({
      error: "kind must be 'snapshots', 'corrections', or 'all'",
      received: kind,
    }, 400);
  }
  return c.json({ query, ...result });
});

// ── Doctrine ───────────────────────────────────────────────────────────────
app.get("/api/doctrine", (c) => {
  const db = openDb();
  const byAgentTag = db.prepare(
    `SELECT agent, tag, COUNT(*) as count FROM corrections GROUP BY agent, tag ORDER BY count DESC, agent`,
  ).all();
  const byAgent = db.prepare(
    `SELECT agent, COUNT(*) as count FROM corrections GROUP BY agent`,
  ).all();
  const totalReadings = db.prepare(`SELECT COUNT(*) as n FROM readings`).get().n;
  const totalCorrections = db.prepare(`SELECT COUNT(*) as n FROM corrections`).get().n;
  const activeSnapshots = db.prepare(`SELECT COUNT(*) as n FROM snapshots WHERE archived = 0`).get().n;
  return c.json({
    by_agent_tag: byAgentTag,
    by_agent: byAgent,
    total_readings: totalReadings,
    total_corrections: totalCorrections,
    active_snapshots: activeSnapshots,
  });
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port });
console.log(`liminal sandbox listening on http://localhost:${port}`);
console.log(`api docs: see API.md  ·  health: GET /api/health`);
