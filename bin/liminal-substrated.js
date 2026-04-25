#!/usr/bin/env node
/**
 * liminal-substrated — the background daemon.
 *
 * Every poll_interval it reads from each enabled source, writes new signals
 * into the vault, then runs the (PR3) thread-detect + trigger pipeline.
 *
 * Sources in this PR: claude-code, git. Everything else is a stub that logs
 * a noop so enabling it doesn't silently fail.
 */

import { openVault } from "../lib/vault/db.js";
import { ensureIntegrations } from "../lib/config/integrations.js";
import { log } from "../lib/log.js";
import { makeClient, CLIENT_MODE_CLI } from "../lib/anthropic-client.js";
import * as claudeCode from "../lib/sources/claude-code.js";
import * as git from "../lib/sources/git.js";
import * as granola from "../lib/sources/granola.js";
import * as stub from "../lib/sources/stub.js";
import { detectThreads } from "../lib/daemon/thread-detect.js";
import { runTriggers } from "../lib/daemon/triggers.js";

const REAL_SOURCES = {
  "claude-code": claudeCode,
  git,
  granola,
};

const STUB_SOURCES = ["calendar", "knowledgeC", "imessage", "obsidian"];
const POLL_DEFAULT_SEC = 300;

let stopping = false;

async function ingestOnce(db, config) {
  const now = Date.now();
  for (const [name, mod] of Object.entries(REAL_SOURCES)) {
    const src = config.sources?.[name];
    if (!src?.enabled) continue;
    try {
      const result = await mod.ingest({ db, config: src, now, log });
      log.info({ source: name, ...result }, "ingest");
    } catch (err) {
      log.error({ source: name, err: err.message }, "ingest_error");
    }
  }
  for (const name of STUB_SOURCES) {
    if (!config.sources?.[name]?.enabled) continue;
    try {
      await stub.ingest({ source: name, db, log });
    } catch (err) {
      log.error({ source: name, err: err.message }, "stub_error");
    }
  }
}

async function tick(db, config, client, mode) {
  await ingestOnce(db, config);
  // Thread-detect spawns a Haiku call per tick. In CLI mode each call boots a
  // full Claude Code runtime with all MCP servers — too expensive to run every
  // 5 minutes on a desktop. Skip it; user-invoked /check and /close still work.
  if (mode === CLIENT_MODE_CLI) {
    log.info({ mode }, "thread_detect_skipped_cli_mode");
  } else {
    try {
      const td = await detectThreads({ db, client, log });
      log.info(td, "thread_detect");
    } catch (err) {
      log.error({ err: err.message }, "thread_detect_error");
    }
  }
  try {
    const tg = await runTriggers({ db, now: new Date(), log });
    log.info(tg, "triggers");
  } catch (err) {
    log.error({ err: err.message }, "trigger_error");
  }
}

async function main() {
  const db = openVault();
  const config = ensureIntegrations();
  const pollSec = Number(process.env.LIMINAL_POLL_SEC) || POLL_DEFAULT_SEC;
  const { client, mode } = makeClient({ log });
  log.info(
    { pid: process.pid, pollSec, anthropic_mode: mode || "none" },
    "daemon_start",
  );

  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });

  while (!stopping) {
    try {
      await tick(db, config, client, mode);
    } catch (err) {
      log.error({ err: err.message, stack: err.stack }, "tick_error");
    }
    if (stopping) break;
    await new Promise((r) => setTimeout(r, pollSec * 1000));
  }

  db.close();
  log.info("daemon_stop");
}

main().catch((err) => {
  log.error({ err: err.message, stack: err.stack }, "fatal");
  process.exit(1);
});
