import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { newId } from "../vault/ids.js";
import { readCursor, writeCursor } from "./cursor.js";

const GRANOLA_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Granola",
);
const CACHE_FILE_RE = /^cache-v(\d+)\.json$/;
const PREFERRED_CACHE = path.join(GRANOLA_DIR, "cache-v6.json");

const TRANSCRIPT_EXCERPT_CHARS = 4000;
const TEXT_FIELD_CHARS = 800;

export const meta = { name: "granola", register: "inner" };

// Discovery: pin to cache-v6 (current known schema). If absent, fall back to
// the highest cache-v*.json present. Granola bumps the suffix on breaking
// schema changes; this keeps the reader alive across most bumps because the
// parser already fails soft on shape mismatch (returns skipped: 'no_state').
function discoverCachePath() {
  if (process.env.LIMINAL_GRANOLA_PATH) return process.env.LIMINAL_GRANOLA_PATH;
  if (fs.existsSync(PREFERRED_CACHE)) return PREFERRED_CACHE;
  let best = null;
  let bestVer = -1;
  let entries;
  try {
    entries = fs.readdirSync(GRANOLA_DIR);
  } catch {
    return PREFERRED_CACHE;
  }
  for (const f of entries) {
    const m = f.match(CACHE_FILE_RE);
    if (!m) continue;
    const ver = Number(m[1]);
    if (Number.isFinite(ver) && ver > bestVer) {
      bestVer = ver;
      best = path.join(GRANOLA_DIR, f);
    }
  }
  return best || PREFERRED_CACHE;
}

export async function ingest({ db, now }) {
  const cachePath = discoverCachePath();
  if (!fs.existsSync(cachePath)) {
    return { ingested: 0, skipped: "no_granola_cache" };
  }

  let raw;
  try {
    raw = fs.readFileSync(cachePath, "utf8");
  } catch {
    return { ingested: 0, skipped: "read_error" };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ingested: 0, skipped: "parse_error" };
  }

  const state = parsed?.cache?.state;
  if (!state || typeof state !== "object") {
    return { ingested: 0, skipped: "no_state" };
  }

  const documents = state.documents && typeof state.documents === "object"
    ? state.documents
    : {};
  const transcripts = state.transcripts && typeof state.transcripts === "object"
    ? state.transcripts
    : {};

  const cursor = readCursor("granola");
  const sinceMs = Number(cursor.last_ingest_at) || 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO signal_events
      (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
    VALUES (?, ?, 'granola', 'meeting', 'inner', NULL, ?, 1, 'native')
  `);

  let ingested = 0;
  for (const docId of Object.keys(documents)) {
    const doc = documents[docId];
    if (!doc || typeof doc !== "object") continue;
    if (doc.deleted_at) continue;
    if (doc.valid_meeting === false) continue;

    const updatedMs = parseTs(doc.updated_at) ?? parseTs(doc.created_at);
    if (!Number.isFinite(updatedMs) || updatedMs < sinceMs) continue;

    const transcriptText = joinTranscript(transcripts[docId]);
    const notes = pickNotes(doc);
    const summary = pickSummary(doc);
    const title = (doc.title || "").trim();

    if (!title && !notes && !summary && !transcriptText) continue;

    const content = {
      doc_id: docId,
      title,
      notes,
      summary,
      transcript_excerpt: transcriptText.slice(0, TRANSCRIPT_EXCERPT_CHARS),
      transcript_length: transcriptText.length,
      has_transcript: transcriptText.length > 0,
      people_count: countPeople(doc.people),
      created_at: doc.created_at || null,
      updated_at: doc.updated_at || null,
      text: buildText({ title, summary, notes, transcriptText }),
    };

    insert.run(newId(), updatedMs, JSON.stringify(content));
    ingested++;
  }

  writeCursor("granola", { last_ingest_at: now });
  return { ingested };
}

function parseTs(v) {
  if (v == null) return NaN;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    const p = Date.parse(v);
    return Number.isFinite(p) ? p : NaN;
  }
  return NaN;
}

function joinTranscript(lines) {
  if (!Array.isArray(lines)) return "";
  return lines
    .filter((l) => l && typeof l.text === "string" && l.is_final !== false)
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join(" ");
}

function pickNotes(doc) {
  const plain = typeof doc.notes_plain === "string" ? doc.notes_plain.trim() : "";
  if (plain) return plain;
  const md = typeof doc.notes_markdown === "string" ? doc.notes_markdown.trim() : "";
  return md;
}

function pickSummary(doc) {
  const s = typeof doc.summary === "string" ? doc.summary.trim() : "";
  if (s) return s;
  const o = typeof doc.overview === "string" ? doc.overview.trim() : "";
  return o;
}

function countPeople(people) {
  if (!people || typeof people !== "object") return 0;
  return Object.keys(people).length;
}

function buildText({ title, summary, notes, transcriptText }) {
  const parts = [];
  if (title) parts.push(`Meeting: ${title}`);
  if (summary) parts.push(summary);
  else if (notes) parts.push(notes);
  else if (transcriptText) parts.push(transcriptText);
  return parts.join("\n").slice(0, TEXT_FIELD_CHARS);
}
