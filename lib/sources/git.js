import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { newId } from "../vault/ids.js";
import { readCursor, writeCursor } from "./cursor.js";

const pExec = promisify(execFile);

export const meta = { name: "git", register: "operational" };

export async function ingest({ db, config, now }) {
  const paths = Array.isArray(config?.paths) ? config.paths : [];
  if (paths.length === 0) {
    return { ingested: 0, skipped: "no_paths_configured" };
  }

  const cursor = readCursor("git");
  const sinceIso = cursor.last_ingest_at
    ? new Date(Number(cursor.last_ingest_at)).toISOString()
    : "24.hours.ago";

  const insert = db.prepare(`
    INSERT OR IGNORE INTO signal_events
      (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
    VALUES (?, ?, 'git', 'commit', 'operational', NULL, ?, 1, 'native')
  `);

  let ingested = 0;
  for (const repo of paths) {
    if (!fs.existsSync(repo)) continue;
    let stdout;
    try {
      const res = await pExec(
        "git",
        ["-C", repo, "log", `--since=${sinceIso}`, "--format=%H%x09%at%x09%an%x09%s"],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      stdout = res.stdout;
    } catch {
      continue;
    }
    for (const line of stdout.split("\n").filter(Boolean)) {
      const [sha, atSec, author, subject] = line.split("\t");
      const ts = Number(atSec) * 1000;
      if (!Number.isFinite(ts)) continue;
      insert.run(
        newId(),
        ts,
        JSON.stringify({ repo, sha, author, subject: subject || "" }),
      );
      ingested++;
    }
  }

  writeCursor("git", { last_ingest_at: now });
  return { ingested };
}
