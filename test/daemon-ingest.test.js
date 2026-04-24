import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { makeTempVault, cleanupVault, writeJsonl } from "./helpers.js";

test("claude-code source ingests user messages, ignores non-user events", async () => {
  const dir = makeTempVault();
  const fakeHome = path.join(dir, "fake-home");
  fs.mkdirSync(fakeHome, { recursive: true });
  process.env.HOME = fakeHome;

  const projectsDir = path.join(fakeHome, ".claude", "projects", "proj-a");
  writeJsonl(path.join(projectsDir, "session.jsonl"), [
    { type: "user", timestamp: "2026-04-24T10:00:00Z", message: { role: "user", content: "shipping today" } },
    { type: "assistant", timestamp: "2026-04-24T10:00:05Z", message: { role: "assistant", content: "ok" } },
    { role: "user", timestamp: "2026-04-24T10:05:00Z", content: "scattered again" },
    { type: "system", timestamp: "2026-04-24T10:06:00Z", content: "env" },
  ]);

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/claude-code.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({ db, now: Date.now() });
    assert.equal(res.ingested, 2, "two user messages expected");

    const rows = db
      .prepare("SELECT * FROM signal_events ORDER BY timestamp")
      .all();
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.source, "claude-code");
      assert.equal(r.register, "inner");
      assert.equal(r.vault_origin, "native");
      const c = JSON.parse(r.content);
      assert.ok(typeof c.text === "string" && c.text.length > 0);
    }

    const res2 = await ingest({ db, now: Date.now() });
    assert.equal(res2.ingested, 0, "cursor prevents re-ingestion");

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("git source ingests commits as operational signals", async () => {
  const dir = makeTempVault();
  const repo = path.join(dir, "fake-repo");
  fs.mkdirSync(repo, { recursive: true });

  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  execFileSync("git", ["-C", repo, "config", "user.email", "test@liminal.local"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "hello\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "initial",
  ]);
  fs.writeFileSync(path.join(repo, "a.txt"), "hello world\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "update",
  ]);

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/git.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({
      db,
      config: { paths: [repo] },
      now: Date.now(),
    });
    assert.equal(res.ingested, 2, "two commits expected");

    const rows = db.prepare("SELECT * FROM signal_events").all();
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.source, "git");
      assert.equal(r.register, "operational");
      assert.equal(r.kind, "commit");
      const c = JSON.parse(r.content);
      assert.equal(c.repo, repo);
      assert.ok(typeof c.sha === "string" && c.sha.length > 0);
    }

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("git source with no paths configured returns skipped, writes nothing", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/git.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({ db, config: { paths: [] }, now: Date.now() });
    assert.equal(res.ingested, 0);
    assert.equal(res.skipped, "no_paths_configured");

    const rows = db.prepare("SELECT COUNT(*) AS c FROM signal_events").get().c;
    assert.equal(rows, 0);

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("claude-code source with no ~/.claude dir returns skipped", async () => {
  const dir = makeTempVault();
  const fakeHome = path.join(dir, "no-claude");
  fs.mkdirSync(fakeHome, { recursive: true });
  process.env.HOME = fakeHome;

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/claude-code.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({ db, now: Date.now() });
    assert.equal(res.skipped, "no_claude_dir");

    db.close();
  } finally {
    cleanupVault(dir);
  }
});
