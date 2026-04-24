import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTempVault, cleanupVault } from "./helpers.js";
import { MIN_DAILY_SIGNALS } from "../lib/daemon/triggers.js";

test("evening close triggers when daily signals >= 5 and no close yet", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { runTriggers } = await import("../lib/daemon/triggers.js?t=" + Date.now());
    const { newId } = await import("../lib/vault/ids.js");
    const db = openVault();

    const now = new Date();
    now.setHours(18, 35, 0, 0);

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const insert = db.prepare(
      `INSERT INTO signal_events (id, timestamp, source, kind, register, content, schema_version, vault_origin)
       VALUES (?, ?, 'claude-code', 'message', 'inner', '{}', 1, 'native')`,
    );
    for (let i = 0; i < MIN_DAILY_SIGNALS; i++) {
      insert.run(newId(), dayStart.getTime() + i * 60_000);
    }

    const result = await runTriggers({ db, now });
    assert.equal(result.close.triggered, true);
    assert.equal(result.close.signal_count, MIN_DAILY_SIGNALS);
    assert.ok(result.close.id);
    assert.equal(result.open_loop.status, "stub");
    assert.equal(result.stuck.status, "stub");

    const row = db
      .prepare("SELECT * FROM surfacing_events WHERE id = ?")
      .get(result.close.id);
    assert.equal(row.trigger, "close");
    assert.equal(row.status, "pending");
    assert.equal(row.vault_origin, "native");

    const again = await runTriggers({ db, now });
    assert.equal(again.close.triggered, false);
    assert.equal(again.close.reason, "already_surfaced_today");

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("evening close does not trigger before close time", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { runTriggers } = await import("../lib/daemon/triggers.js?t=" + Date.now());
    const { newId } = await import("../lib/vault/ids.js");
    const db = openVault();

    const now = new Date();
    now.setHours(10, 0, 0, 0);
    const insert = db.prepare(
      `INSERT INTO signal_events (id, timestamp, source, kind, register, content, schema_version, vault_origin)
       VALUES (?, ?, 'claude-code', 'message', 'inner', '{}', 1, 'native')`,
    );
    for (let i = 0; i < 20; i++) insert.run(newId(), now.getTime() - 3_600_000);

    const result = await runTriggers({ db, now });
    assert.equal(result.close.triggered, false);
    assert.equal(result.close.reason, "before_close_time");

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("evening close does not trigger below min signals", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { runTriggers } = await import("../lib/daemon/triggers.js?t=" + Date.now());
    const { newId } = await import("../lib/vault/ids.js");
    const db = openVault();

    const now = new Date();
    now.setHours(20, 0, 0, 0);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const insert = db.prepare(
      `INSERT INTO signal_events (id, timestamp, source, kind, register, content, schema_version, vault_origin)
       VALUES (?, ?, 'claude-code', 'message', 'inner', '{}', 1, 'native')`,
    );
    insert.run(newId(), dayStart.getTime() + 60_000);

    const result = await runTriggers({ db, now });
    assert.equal(result.close.triggered, false);
    assert.equal(result.close.reason, "below_min_signals");
    assert.equal(result.close.signal_count, 1);

    db.close();
  } finally {
    cleanupVault(dir);
  }
});

test("liminal-surface marks a pending surfacing_event accepted", async () => {
  const dir = makeTempVault();
  try {
    const { openVault } = await import("../lib/vault/db.js?t=" + Date.now());
    const { newId } = await import("../lib/vault/ids.js");
    const db = openVault();

    const sid = newId();
    db.prepare(
      `INSERT INTO surfacing_events (id, timestamp, trigger, status, payload, deliberation_id, schema_version, vault_origin)
       VALUES (?, ?, 'close', 'pending', NULL, NULL, 1, 'native')`,
    ).run(sid, Date.now());
    db.close();

    const { execFileSync } = await import("node:child_process");
    const surfaceBin = new URL("../bin/liminal-surface.js", import.meta.url).pathname;
    const out = execFileSync(
      process.execPath,
      [surfaceBin, `liminal://close?surfacing_id=${sid}`],
      { env: { ...process.env }, encoding: "utf8" },
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.kind, "close");
    assert.equal(parsed.surfacing_id, sid);
    assert.equal(parsed.updated, 1);

    const db2 = openVault();
    const row = db2
      .prepare("SELECT status FROM surfacing_events WHERE id = ?")
      .get(sid);
    assert.equal(row.status, "accepted");
    db2.close();
  } finally {
    cleanupVault(dir);
  }
});
