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
      error: "no Anthropic credential. set ANTHROPIC_API_KEY or run `claude setup-token`.",
    }, 500);
  }
  try {
    const result = await runReading({ client, mode });
    return c.json(result);
  } catch (e) {
    return c.json({ error: `read failed: ${e.message}` }, 500);
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
  if (!row) return c.json({ error: "not found" }, 404);
  const corrections = db.prepare(
    `SELECT id, agent, tag, note, timestamp FROM corrections WHERE reading_id = ? ORDER BY timestamp ASC`,
  ).all(id);
  let snapshotIds = [];
  let threads = [];
  try { snapshotIds = JSON.parse(row.snapshot_ids); } catch {}
  try { threads = JSON.parse(row.threads); } catch {}
  return c.json({
    reading_id: row.id,
    timestamp: row.timestamp,
    snapshot_count: row.snapshot_count,
    snapshot_ids: snapshotIds,
    signal_summary: row.signal_summary,
    threads,
    architect: { interpretation: row.architect_view },
    witness: { interpretation: row.witness_view },
    contrarian: { interpretation: row.contrarian_view },
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
    return c.json({ error: "need reading_id, agent, tag" }, 400);
  }
  if (!["architect", "witness", "contrarian"].includes(agent)) {
    return c.json({ error: "agent must be architect|witness|contrarian" }, 400);
  }
  if (!isValidTag(tag)) {
    return c.json({ error: `invalid tag. allowed: ${CORRECTION_TAGS.join(", ")}` }, 400);
  }
  const db = openDb();
  const exists = db.prepare(`SELECT 1 FROM readings WHERE id = ?`).get(reading_id);
  if (!exists) return c.json({ error: "unknown reading_id" }, 404);

  const id = newId();
  db.prepare(
    `INSERT INTO corrections (id, reading_id, agent, tag, note, timestamp) VALUES (?,?,?,?,?,?)`,
  ).run(id, reading_id, agent, tag, note || null, Date.now());

  return c.json({ ok: true, correction_id: id });
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
