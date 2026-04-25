import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeTempVault, cleanupVault } from "./helpers.js";

function writeGranolaCache(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ cache: { state, version: 6 } }),
  );
}

test("granola source ingests valid meetings, skips deleted and invalid", async () => {
  const dir = makeTempVault();
  const cachePath = path.join(dir, "granola-cache.json");
  process.env.LIMINAL_GRANOLA_PATH = cachePath;

  writeGranolaCache(cachePath, {
    documents: {
      "doc-1": {
        id: "doc-1",
        title: "Cockroach DB post-incident review",
        created_at: "2026-04-21T15:01:20.044Z",
        updated_at: "2026-04-21T15:31:04.029Z",
        notes_plain: "action items: paginate tx, audit retries",
        valid_meeting: true,
      },
      "doc-deleted": {
        id: "doc-deleted",
        title: "Cancelled sync",
        created_at: "2026-04-22T15:00:00.000Z",
        updated_at: "2026-04-22T15:00:00.000Z",
        notes_plain: "",
        deleted_at: "2026-04-22T15:01:00.000Z",
        valid_meeting: true,
      },
      "doc-invalid": {
        id: "doc-invalid",
        title: "Stray audio",
        created_at: "2026-04-23T15:00:00.000Z",
        updated_at: "2026-04-23T15:00:00.000Z",
        notes_plain: "garbage",
        valid_meeting: false,
      },
      "doc-empty": {
        id: "doc-empty",
        title: "",
        created_at: "2026-04-24T15:00:00.000Z",
        updated_at: "2026-04-24T15:00:00.000Z",
        notes_plain: "",
        notes_markdown: "",
        summary: null,
        overview: null,
        valid_meeting: true,
      },
    },
    transcripts: {
      "doc-1": [
        { text: "Hey, how's it going?", is_final: true },
        { text: "We need to fix the retry loop.", is_final: true },
        { text: "[interim]", is_final: false },
      ],
    },
  });

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/granola.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({ db, now: Date.now() });
    assert.equal(res.ingested, 1, "only one valid, non-deleted, non-empty meeting expected");

    const rows = db.prepare("SELECT * FROM signal_events").all();
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.source, "granola");
    assert.equal(row.kind, "meeting");
    assert.equal(row.register, "inner");
    assert.equal(row.vault_origin, "native");

    const c = JSON.parse(row.content);
    assert.equal(c.doc_id, "doc-1");
    assert.equal(c.title, "Cockroach DB post-incident review");
    assert.ok(c.notes.includes("paginate"));
    assert.ok(c.has_transcript);
    assert.ok(c.transcript_excerpt.includes("retry loop"));
    assert.ok(!c.transcript_excerpt.includes("[interim]"), "non-final lines excluded");
    assert.ok(c.text.startsWith("Meeting:"));

    const res2 = await ingest({ db, now: Date.now() });
    assert.equal(res2.ingested, 0, "cursor prevents re-ingestion");

    db.close();
  } finally {
    delete process.env.LIMINAL_GRANOLA_PATH;
    cleanupVault(dir);
  }
});

test("granola source returns skipped when cache file missing", async () => {
  const dir = makeTempVault();
  process.env.LIMINAL_GRANOLA_PATH = path.join(dir, "does-not-exist.json");

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/granola.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({ db, now: Date.now() });
    assert.equal(res.ingested, 0);
    assert.equal(res.skipped, "no_granola_cache");

    const count = db.prepare("SELECT COUNT(*) AS c FROM signal_events").get().c;
    assert.equal(count, 0);

    db.close();
  } finally {
    delete process.env.LIMINAL_GRANOLA_PATH;
    cleanupVault(dir);
  }
});

test("granola source returns skipped on malformed JSON, writes nothing", async () => {
  const dir = makeTempVault();
  const cachePath = path.join(dir, "broken.json");
  fs.writeFileSync(cachePath, "{ this is not json");
  process.env.LIMINAL_GRANOLA_PATH = cachePath;

  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { ingest } = await import("../lib/sources/granola.js?t=" + Date.now());
    const db = openVault();

    const res = await ingest({ db, now: Date.now() });
    assert.equal(res.skipped, "parse_error");

    const count = db.prepare("SELECT COUNT(*) AS c FROM signal_events").get().c;
    assert.equal(count, 0);

    db.close();
  } finally {
    delete process.env.LIMINAL_GRANOLA_PATH;
    cleanupVault(dir);
  }
});
