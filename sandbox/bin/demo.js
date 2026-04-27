#!/usr/bin/env node
// Polished demo runner for OSS4AI Hackathon #32 (and any future on-stage demo).
//
// Seeds the vault, runs a 12-agent reading, and prints the result in
// register-grouped, ANSI-colored format. Designed for a 60-90 second
// on-camera moment.
//
// Usage:
//   node bin/demo.js            # uses cached read if vault unchanged
//   node bin/demo.js --fresh    # forces a fresh read (~100s)
//   node bin/demo.js --no-color # plain text

import { setTimeout as sleep } from "node:timers/promises";
import { dropSnapshot, runReading, clearVault, listActiveSnapshots } from "../lib/orchestrator.js";
import { seedDemoVault } from "../lib/seed.js";
import { makeClientOrExit } from "../lib/anthropic-client.js";
import { agentsByRegister, REGISTERS } from "../lib/agents/index.js";

const args = process.argv.slice(2);
const FRESH = args.includes("--fresh");
const NOCOLOR = args.includes("--no-color") || !process.stdout.isTTY;

// ─── ANSI helpers ────────────────────────────────────────────────────────

const C = NOCOLOR
  ? { dim: "", reset: "", bold: "", cyan: "", magenta: "", yellow: "", green: "", red: "", gray: "" }
  : {
      dim: "\x1b[2m", reset: "\x1b[0m", bold: "\x1b[1m",
      cyan: "\x1b[36m", magenta: "\x1b[35m", yellow: "\x1b[33m",
      green: "\x1b[32m", red: "\x1b[31m", gray: "\x1b[90m",
    };

const REGISTER_COLOR = {
  Diligence: C.cyan,
  Outreach:  C.green,
  Judgment:  C.yellow,
  Operations: C.magenta,
};

function rule(label = "") {
  const w = process.stdout.columns || 80;
  const line = "─".repeat(w);
  if (label) {
    const mid = `─── ${label} `;
    console.log(C.gray + mid + line.slice(mid.length) + C.reset);
  } else {
    console.log(C.gray + line + C.reset);
  }
}

function header() {
  console.log("");
  console.log(C.bold + "  LIMINAL AGENTS · twelve bounded specialists" + C.reset);
  console.log(C.dim  + "  diligence · outreach · judgment · operations" + C.reset);
  console.log("");
}

// ─── Demo flow ───────────────────────────────────────────────────────────

async function main() {
  header();

  // Ensure vault has snapshots. If empty, seed.
  const existing = listActiveSnapshots();
  if (existing.length === 0) {
    rule("seeding vault · 5 snapshots");
    seedDemoVault();
    await sleep(200);
  } else {
    rule(`vault has ${existing.length} active snapshots`);
  }

  rule("running 12 agents in parallel");
  const t0 = Date.now();
  const { client, mode } = makeClientOrExit();
  const reading = await runReading({ client, mode, useCache: !FRESH });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ─── Synthesis ─────────────────────────────────────────────────────────
  console.log("");
  console.log(C.bold + "synthesis" + C.reset + C.gray + ` · ${reading.snapshot_count} snapshots · ${reading.cached ? "cached" : "fresh"} · ${elapsed}s` + C.reset);
  console.log("");
  console.log("  " + reading.signal_summary);
  console.log("");

  if (reading.threads?.length) {
    console.log(C.bold + "threads" + C.reset);
    for (const [i, t] of reading.threads.entries()) {
      console.log("");
      console.log("  " + C.dim + (i + 1) + ". " + C.reset + C.bold + t.label + C.reset);
      console.log("     " + t.summary);
    }
    console.log("");
  }

  // ─── Agents, grouped by register ───────────────────────────────────────
  const grouped = agentsByRegister();
  for (const reg of REGISTERS) {
    rule(reg.toUpperCase());
    for (const agent of grouped[reg]) {
      const r = reading.agents[agent.key];
      if (!r) continue;
      const isRefuse = r.interpretation.startsWith("REFUSE:");
      const color = REGISTER_COLOR[reg];
      const label = `  ${color}${C.bold}${agent.name}${C.reset}`;
      const tag = isRefuse
        ? `  ${C.red}${C.bold}REFUSED${C.reset}`
        : `  ${C.green}IN LANE${C.reset}`;
      console.log("");
      console.log(`${label}${tag} ${C.gray}· ${agent.domain}${C.reset}`);
      console.log("");
      // Wrap interpretation at ~76 chars per line.
      const text = r.interpretation;
      const lines = wrap(text, 76);
      for (const ln of lines) console.log("  " + ln);
    }
    console.log("");
  }

  // ─── Footer ────────────────────────────────────────────────────────────
  rule();
  const refused = Object.values(reading.agents).filter((a) => a.interpretation.startsWith("REFUSE:")).length;
  const inLane = Object.values(reading.agents).length - refused;
  console.log("");
  console.log(`  ${C.bold}${inLane}${C.reset} in lane  ·  ${C.bold}${refused}${C.reset} refused  ·  reading_id ${C.dim}${reading.reading_id}${C.reset}`);
  console.log(`  ${C.dim}refusal is the feature.  the record is the moat.${C.reset}`);
  console.log("");
}

function wrap(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > width) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

main().catch((err) => {
  console.error(C.red + "demo failed:" + C.reset, err.message);
  process.exit(1);
});
