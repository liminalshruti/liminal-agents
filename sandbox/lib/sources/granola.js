// Granola source reader.
//
// The local Granola cache (~/Library/Application Support/Granola/cache-v6.json)
// is mostly an index — titles, calendar metadata, attendees — with empty notes
// fields. The rich AI-generated content lives in IndexedDB (a Chromium leveldb
// tree) or is fetched server-side on demand by the desktop app.
//
// This reader has two paths:
//   1. extractFromIDB() — copy IDB to tmp, walk leveldb, attempt v8.deserialize
//      on values, recover the document objects. The ambitious path.
//   2. titlesFromCache() — fall back to titles + attendees + calendar times
//      from cache-v6.json. Thin but always works.
//
// Set LIMINAL_GRANOLA_MODE=titles to skip the IDB attempt.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import v8 from "node:v8";

const CACHE_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Granola/cache-v6.json",
);
const IDB_DIR = path.join(
  os.homedir(),
  "Library/Application Support/Granola/IndexedDB/app_ui_0.indexeddb.leveldb",
);

const TEXT_CAP = 800;
const IDB_BUDGET_MS = 30_000; // 30 second hard timeout on IDB walk

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function recentDocs(cache, days) {
  if (!cache?.cache?.state?.documents) return [];
  const cutoff = Date.now() - days * 86400000;
  const out = [];
  for (const [id, doc] of Object.entries(cache.cache.state.documents)) {
    if (!doc || doc.deleted_at) continue;
    const ts = Date.parse(doc.created_at || doc.updated_at || "");
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    out.push({ id, doc, ts });
  }
  return out;
}

function flattenProseMirror(node, acc = []) {
  if (!node) return acc;
  if (typeof node.text === "string") acc.push(node.text);
  if (Array.isArray(node.content)) for (const c of node.content) flattenProseMirror(c, acc);
  return acc;
}

function attendeesString(doc) {
  const att = doc.people?.attendees;
  if (!Array.isArray(att) || !att.length) return "";
  const names = att
    .map((a) => a?.name || a?.email || a?.displayName)
    .filter(Boolean)
    .slice(0, 6);
  return names.length ? "with " + names.join(", ") : "";
}

function buildTitleSnapshot(id, doc, ts, extraText = "") {
  const title = doc.title || "(untitled meeting)";
  const att = attendeesString(doc);
  const transcript = doc.transcribe ? "transcribed" : "";
  const flagged = [att, transcript].filter(Boolean).join(" · ");
  const body = [extraText, flagged].filter(Boolean).join("\n\n").slice(0, TEXT_CAP);
  return {
    timestamp: ts,
    kind: "meeting",
    label: title.slice(0, 90),
    text: body || `Meeting: ${title}.`,
  };
}

// ── path 1: titles + transcripts already in cache ──────────────────────────

function titlesFromCache(days) {
  const cache = loadCache();
  if (!cache) return { snapshots: [], stats: { reason: "cache_missing" } };
  const recent = recentDocs(cache, days);
  const transcripts = cache.cache.state.transcripts || {};
  const snapshots = [];
  let withTranscript = 0;
  let withInlineNotes = 0;

  for (const { id, doc, ts } of recent) {
    let extra = "";
    // a) embedded transcripts (rare — only ~2 in cache typically)
    const tr = transcripts[id];
    if (Array.isArray(tr) && tr.length) {
      const text = tr.map((seg) => String(seg.text || "").trim()).filter(Boolean).join(" ");
      if (text.length > 80) {
        extra = text;
        withTranscript++;
      }
    }
    // b) sometimes the user typed inline notes into the prosemirror tree
    if (!extra && doc.notes) {
      const flat = flattenProseMirror(doc.notes).join(" ").trim();
      if (flat.length > 50) {
        extra = flat;
        withInlineNotes++;
      }
    }
    snapshots.push(buildTitleSnapshot(id, doc, ts, extra));
  }
  return {
    snapshots,
    stats: {
      mode: "titles_from_cache",
      docs_in_window: recent.length,
      with_inline_transcript: withTranscript,
      with_inline_notes: withInlineNotes,
    },
  };
}

// ── path 2: IDB extraction (ambitious, with hard budget) ────────────────────

async function extractFromIDB(days) {
  if (!fs.existsSync(IDB_DIR)) {
    return { snapshots: [], stats: { reason: "idb_missing" } };
  }
  let ClassicLevel;
  try {
    ({ ClassicLevel } = await import("classic-level"));
  } catch (e) {
    return { snapshots: [], stats: { reason: "classic_level_unavailable", error: e.message } };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "liminal-granola-idb-"));
  // Snapshot copy to avoid lock conflicts
  fs.cpSync(IDB_DIR, tmp, { recursive: true, force: true });
  // The MANIFEST/CURRENT may reference a LOCK file — drop it
  try { fs.rmSync(path.join(tmp, "LOCK"), { force: true }); } catch {}

  const cache = loadCache();
  const recent = cache ? recentDocs(cache, days) : [];
  const recentById = new Map(recent.map((r) => [r.id, r]));

  // Map: docId -> best-recovered text fragment
  const recovered = new Map();

  const deadline = Date.now() + IDB_BUDGET_MS;
  let scanned = 0;
  let parsed = 0;
  let kvs = 0;
  let openErr = null;

  let db;
  try {
    db = new ClassicLevel(tmp, { keyEncoding: "buffer", valueEncoding: "buffer" });
    await db.open();
  } catch (e) {
    openErr = e.message;
  }

  if (openErr) {
    return { snapshots: [], stats: { reason: "idb_open_failed", error: openErr } };
  }

  try {
    for await (const [, value] of db.iterator()) {
      kvs++;
      if (Date.now() > deadline) break;
      // Try v8.deserialize after stripping common Chromium IDB header bytes.
      // The exact header varies, but in practice values for recent Chromium
      // start with one or two version bytes (0xff / 0x0d / 0x11) before the
      // V8 structured-clone payload begins (which itself starts with 0xff 0x0f
      // or 0xff 0x0e, then 0x6f for an object).
      let obj = null;
      for (const prefix of [0, 1, 2, 3, 4, 5, 6]) {
        if (prefix >= value.length) break;
        try {
          obj = v8.deserialize(value.slice(prefix));
          break;
        } catch {}
      }
      scanned++;
      if (!obj) continue;
      parsed++;
      // Heuristic: if obj has an "id" string that's a UUID and a "notes" or
      // "summary" field, attribute the recovered text to that doc.
      collectFromObj(obj, recovered, recentById);
    }
  } finally {
    try { await db.close(); } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  const snapshots = [];
  let withRecovered = 0;
  for (const { id, doc, ts } of recent) {
    const text = (recovered.get(id) || "").slice(0, TEXT_CAP);
    if (text) withRecovered++;
    snapshots.push(buildTitleSnapshot(id, doc, ts, text));
  }

  return {
    snapshots,
    stats: {
      mode: "idb_extracted",
      docs_in_window: recent.length,
      with_recovered_text: withRecovered,
      kvs_scanned: kvs,
      kvs_parsed: parsed,
      idb_budget_hit: Date.now() > deadline,
    },
  };
}

function collectFromObj(obj, recovered, recentById, depth = 0) {
  if (depth > 6 || !obj) return;
  if (typeof obj === "string") return;
  if (Array.isArray(obj)) {
    for (const v of obj) collectFromObj(v, recovered, recentById, depth + 1);
    return;
  }
  if (typeof obj !== "object") return;

  // Detect doc-shaped object
  const id = obj.id || obj.document_id || obj.documentId;
  if (typeof id === "string" && recentById.has(id)) {
    const fragments = [];
    // Prefer ProseMirror notes
    if (obj.notes && typeof obj.notes === "object") {
      const t = flattenProseMirror(obj.notes).join(" ").trim();
      if (t.length > 50) fragments.push(t);
    }
    // Plain text fallbacks
    for (const k of ["notes_plain", "notes_markdown", "summary", "overview", "transcript", "panel_text", "content"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim().length > 50) fragments.push(v.trim());
    }
    if (fragments.length) {
      const joined = fragments.join("\n\n");
      const prev = recovered.get(id) || "";
      // Keep the longest recovered fragment per doc
      if (joined.length > prev.length) recovered.set(id, joined);
    }
  }

  for (const v of Object.values(obj)) {
    collectFromObj(v, recovered, recentById, depth + 1);
  }
}

// ── public API ─────────────────────────────────────────────────────────────

export async function readGranola({ days = 30 } = {}) {
  const mode = process.env.LIMINAL_GRANOLA_MODE || "auto";

  if (mode === "titles") {
    return titlesFromCache(days);
  }

  // auto: try IDB first, fall back if it returns nothing useful
  const idbResult = await extractFromIDB(days);
  const recoveredCount = idbResult.stats?.with_recovered_text || 0;
  if (recoveredCount > 0) {
    return idbResult;
  }
  // Fall back to titles, but include the IDB stats in the response so we know
  // what happened.
  const titlesResult = titlesFromCache(days);
  return {
    snapshots: titlesResult.snapshots,
    stats: {
      ...titlesResult.stats,
      mode: "titles_after_idb_failure",
      idb_attempt: idbResult.stats,
    },
  };
}
