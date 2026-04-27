import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const TEXT_CAP = 800;

function safeReaddir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}

function eventTimestamp(evt) {
  for (const c of [evt.timestamp, evt.time, evt.created_at]) {
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

function decodeProjectName(dirName) {
  // Claude stores project paths as "/Users/foo/work/repo" → "-Users-foo-work-repo"
  // Reverse just enough to be human-readable for the snapshot label.
  if (dirName.startsWith("-")) {
    return "/" + dirName.slice(1).replace(/-/g, "/");
  }
  return dirName;
}

function fmtTimestamp(ts) {
  const d = new Date(ts);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}`;
}

function shortenPath(p) {
  // Keep the project leaf + one parent so the label fits.
  const parts = p.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function readSession(filepath) {
  let raw;
  try { raw = fs.readFileSync(filepath, "utf8"); } catch { return null; }
  const lines = raw.split("\n").filter(Boolean);
  const userMessages = [];
  let firstTs = NaN;
  for (const line of lines) {
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    if (!isUserMessage(evt)) continue;
    const text = extractText(evt);
    if (!text) continue;
    const trimmed = text.trim();
    if (!trimmed) continue;
    // Skip pollution: tool results, interrupt markers, claude-code internal
    // wrappers, and our own bounded-agent / synthesis prompts that get logged
    // when an orchestrator invokes `claude -p` with a wrapped prefix.
    if (
      trimmed.startsWith("<tool_use_result") ||
      trimmed.startsWith("[Request interrupted") ||
      trimmed.startsWith("<system>") ||
      trimmed.startsWith("<local-command-caveat") ||
      trimmed.startsWith("<local-command-stdout") ||
      trimmed.startsWith("<local-command-stderr") ||
      trimmed.startsWith("<command-name>") ||
      trimmed.startsWith("<command-message>") ||
      /^You are the (Architect|Witness|Contrarian)/.test(trimmed) ||
      /^You receive (snapshots|today'?s signals)/.test(trimmed) ||
      /^Reply with exactly the word/.test(trimmed)
    ) continue;
    const ts = eventTimestamp(evt);
    if (Number.isFinite(ts) && !Number.isFinite(firstTs)) firstTs = ts;
    userMessages.push(trimmed);
    if (userMessages.length >= 2) break;
  }
  return { firstTs, userMessages };
}

export async function readClaudeCode({ days = 30, count = 30 } = {}) {
  if (!fs.existsSync(CLAUDE_DIR)) {
    return { snapshots: [], stats: { reason: "no_claude_dir" } };
  }
  const cutoff = Date.now() - days * 86400000;

  // Collect candidate jsonl files with mtime within window
  const candidates = [];
  for (const proj of safeReaddir(CLAUDE_DIR)) {
    const projDir = path.join(CLAUDE_DIR, proj);
    let projStat;
    try { projStat = fs.statSync(projDir); } catch { continue; }
    if (!projStat.isDirectory()) continue;
    for (const f of safeReaddir(projDir)) {
      if (!f.endsWith(".jsonl")) continue;
      const full = path.join(projDir, f);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.mtimeMs < cutoff) continue;
      candidates.push({ proj, file: f, full, mtimeMs: stat.mtimeMs });
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const taken = candidates.slice(0, count);

  const snapshots = [];
  let skippedNoUser = 0;
  for (const c of taken) {
    const session = readSession(c.full);
    if (!session || session.userMessages.length === 0) {
      skippedNoUser++;
      continue;
    }
    const ts = Number.isFinite(session.firstTs) ? session.firstTs : c.mtimeMs;
    const projDecoded = decodeProjectName(c.proj);
    const projShort = shortenPath(projDecoded);
    const label = `${projShort} · ${fmtTimestamp(ts)}`;
    let text = session.userMessages.join("\n\n").slice(0, TEXT_CAP);
    snapshots.push({ timestamp: ts, kind: "paste", label, text });
  }

  return {
    snapshots,
    stats: {
      candidates_in_window: candidates.length,
      taken: taken.length,
      ingested: snapshots.length,
      skipped_no_user_message: skippedNoUser,
    },
  };
}
