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

import Anthropic from "@anthropic-ai/sdk";
import { openVault } from "../lib/vault/db.js";
import { ensureIntegrations } from "../lib/config/integrations.js";
import { log } from "../lib/log.js";
import * as claudeCode from "../lib/sources/claude-code.js";
import * as git from "../lib/sources/git.js";
import * as stub from "../lib/sources/stub.js";
import { detectThreads } from "../lib/daemon/thread-detect.js";
import { runTriggers } from "../lib/daemon/triggers.js";

const REAL_SOURCES = {
  "claude-code": claudeCode,
  git,
};

const STUB_SOURCES = ["granola", "calendar", "knowledgeC", "imessage", "obsidian"];
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

async function tick(db, config, client) {
  await ingestOnce(db, config);
  try {
    const td = await detectThreads({ db, client, log });
    log.info(td, "thread_detect");
  } catch (err) {
    log.error({ err: err.message }, "thread_detect_error");
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = apiKey ? new Anthropic({ apiKey }) : null;
  log.info(
    { pid: process.pid, pollSec, haiku: Boolean(client) },
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
      await tick(db, config, client);
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
