import { createHash } from "node:crypto";
import { runAllAgents, OPUS_MODEL } from "./agents/index.js";
import { synthesizeAcrossSnapshots } from "./synthesis.js";
import { openDb, newId } from "./db.js";

function hashSnapshotIds(ids) {
  // Sorted to make order irrelevant; the synthesis treats the vault as a set.
  // Hash also includes model so changing model invalidates cache.
  return createHash("sha256").update([...ids].sort().join("|")).digest("hex").slice(0, 24);
}

function inflateCachedReading(row) {
  let snapshotIds = [];
  let threads = [];
  try { snapshotIds = JSON.parse(row.snapshot_ids); } catch {}
  try { threads = JSON.parse(row.threads); } catch {}
  return {
    reading_id: row.id,
    cached: true,
    timestamp: row.timestamp,
    snapshot_count: row.snapshot_count,
    snapshot_ids: snapshotIds,
    signal_summary: row.signal_summary,
    threads,
    architect: { name: "Architect", key: "architect", domain: "structure, not feeling", interpretation: row.architect_view },
    witness:   { name: "Witness",   key: "witness",   domain: "felt, not strategic",    interpretation: row.witness_view },
    contrarian:{ name: "Contrarian",key: "contrarian",domain: "inversion, not balance", interpretation: row.contrarian_view },
    model: row.model,
    client_mode: row.client_mode,
  };
}

export function findCachedReadingForActiveVault({ model = OPUS_MODEL } = {}) {
  const snapshots = listActiveSnapshots();
  if (!snapshots.length) return null;
  const hash = hashSnapshotIds(snapshots.map((s) => s.id));
  const db = openDb();
  const row = db.prepare(
    `SELECT * FROM readings WHERE snapshot_ids_hash = ? AND model = ? ORDER BY timestamp DESC LIMIT 1`,
  ).get(hash, model);
  return row ? inflateCachedReading(row) : null;
}

export function listActiveSnapshots() {
  const db = openDb();
  return db
    .prepare(`SELECT id, timestamp, kind, text, label FROM snapshots WHERE archived = 0 ORDER BY timestamp ASC`)
    .all();
}

export function dropSnapshot({ kind, text, label = null, timestamp = null }) {
  if (!kind || !text) throw new Error("snapshot: kind and text required");
  if (!["meeting", "decision", "incident", "paste"].includes(kind)) {
    throw new Error(`snapshot: kind must be meeting|decision|incident|paste, got ${kind}`);
  }
  const db = openDb();
  const id = newId();
  const ts = Number.isFinite(timestamp) ? Number(timestamp) : Date.now();
  db.prepare(
    `INSERT INTO snapshots (id, timestamp, kind, text, label, archived) VALUES (?,?,?,?,?,0)`,
  ).run(id, ts, kind, String(text), label);
  return { id, timestamp: ts, kind, text, label };
}

export function archiveSnapshot(id) {
  const db = openDb();
  const r = db.prepare(`UPDATE snapshots SET archived = 1 WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function clearVault() {
  const db = openDb();
  db.prepare(`UPDATE snapshots SET archived = 1`).run();
}

export async function runReading({ client, mode, model = OPUS_MODEL, useCache = true }) {
  const snapshots = listActiveSnapshots();
  if (!snapshots.length) {
    throw new Error("vault is empty — drop at least one snapshot before reading");
  }

  const hash = hashSnapshotIds(snapshots.map((s) => s.id));

  if (useCache) {
    const db = openDb();
    const cached = db.prepare(
      `SELECT * FROM readings WHERE snapshot_ids_hash = ? AND model = ? ORDER BY timestamp DESC LIMIT 1`,
    ).get(hash, model);
    if (cached) return inflateCachedReading(cached);
  }

  const synthesis = await synthesizeAcrossSnapshots(client, snapshots, model);
  const stateForAgents = synthesis.signal_summary || `${snapshots.length} snapshots`;
  const contextForAgents = synthesis.threads
    .map((t, i) => `Thread ${i + 1}: ${t.label} — ${t.summary}`)
    .join("\n");

  const byKey = await runAllAgents(client, stateForAgents, contextForAgents, model);

  const db = openDb();
  const readingId = newId();
  const now = Date.now();
  const snapshotIds = snapshots.map((s) => s.id);

  db.prepare(
    `INSERT INTO readings (
       id, timestamp, snapshot_ids, snapshot_ids_hash, snapshot_count,
       signal_summary, threads, architect_view, witness_view, contrarian_view,
       model, client_mode
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    readingId,
    now,
    JSON.stringify(snapshotIds),
    hash,
    snapshotIds.length,
    synthesis.signal_summary,
    JSON.stringify(synthesis.threads),
    byKey.architect?.interpretation || null,
    byKey.witness?.interpretation || null,
    byKey.contrarian?.interpretation || null,
    model,
    mode || null,
  );

  return {
    reading_id: readingId,
    cached: false,
    timestamp: now,
    snapshot_count: snapshotIds.length,
    snapshot_ids: snapshotIds,
    signal_summary: synthesis.signal_summary,
    threads: synthesis.threads,
    architect: byKey.architect,
    witness: byKey.witness,
    contrarian: byKey.contrarian,
    model,
    client_mode: mode || null,
  };
}
