import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { newId } from "../vault/ids.js";
import { readCursor, writeCursor } from "./cursor.js";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");

export const meta = { name: "claude-code", register: "inner" };

export async function ingest({ db, now }) {
  if (!fs.existsSync(CLAUDE_DIR)) {
    return { ingested: 0, skipped: "no_claude_dir" };
  }
  const cursor = readCursor("claude-code");
  const sinceMs = Number(cursor.last_ingest_at) || 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO signal_events
      (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
    VALUES (?, ?, 'claude-code', ?, 'inner', NULL, ?, 1, 'native')
  `);

  let ingested = 0;
  const projects = safeReaddir(CLAUDE_DIR);
  for (const proj of projects) {
    const projDir = path.join(CLAUDE_DIR, proj);
    const files = safeReaddir(projDir).filter((f) => f.endsWith(".jsonl"));
    for (const f of files) {
      const full = path.join(projDir, f);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs < sinceMs) continue;

      let raw;
      try {
        raw = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const lines = raw.split("\n").filter(Boolean);
      for (const line of lines) {
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        const ts = eventTimestamp(evt);
        if (!Number.isFinite(ts) || ts < sinceMs) continue;
        if (!isUserMessage(evt)) continue;
        const text = extractText(evt);
        if (!text) continue;

        insert.run(
          newId(),
          ts,
          evt.type || "user_message",
          JSON.stringify({ project: proj, file: f, text }),
        );
        ingested++;
      }
    }
  }

  writeCursor("claude-code", { last_ingest_at: now });
  return { ingested };
}

function safeReaddir(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function eventTimestamp(evt) {
  const candidates = [evt.timestamp, evt.time, evt.created_at];
  for (const c of candidates) {
    if (typeof c === "number") return c < 1e12 ? c * 1000 : c;
    if (typeof c === "string") {
      const parsed = Date.parse(c);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return NaN;
}

function isUserMessage(evt) {
  if (evt.type === "user" || evt.type === "user_message") return true;
  if (evt.role === "user") return true;
  if (evt.message?.role === "user") return true;
  return false;
}

function extractText(evt) {
  const src = evt.message ?? evt;
  if (typeof src.content === "string") return src.content;
  if (Array.isArray(src.content)) {
    return (
      src.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n") || null
    );
  }
  return null;
}
