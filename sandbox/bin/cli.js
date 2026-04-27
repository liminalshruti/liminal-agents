#!/usr/bin/env node
import { dropSnapshot, listActiveSnapshots, runReading, clearVault } from "../lib/orchestrator.js";
import { seedDemoVault } from "../lib/seed.js";
import { makeClientOrExit } from "../lib/anthropic-client.js";

const [, , cmd, ...rest] = process.argv;

function usage() {
  console.error(`usage:
  cli drop --kind=meeting|decision|incident|paste [--label="..."] "<text>"
  cli list
  cli read
  cli seed
  cli clear`);
  process.exit(1);
}

function parseFlags(args) {
  const flags = {};
  const pos = [];
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]] = m[2];
    else if (a.startsWith("--")) flags[a.slice(2)] = "true";
    else pos.push(a);
  }
  return { flags, pos };
}

if (!cmd) usage();

if (cmd === "drop") {
  const { flags, pos } = parseFlags(rest);
  const text = pos.join(" ");
  if (!text) usage();
  const s = dropSnapshot({ kind: flags.kind || "paste", text, label: flags.label || null });
  console.log(JSON.stringify(s, null, 2));
} else if (cmd === "list") {
  console.log(JSON.stringify(listActiveSnapshots(), null, 2));
} else if (cmd === "seed") {
  clearVault();
  const seeded = seedDemoVault();
  console.log(`seeded ${seeded.length} demo snapshots`);
} else if (cmd === "clear") {
  clearVault();
  console.log("vault cleared");
} else if (cmd === "read") {
  const { client, mode } = makeClientOrExit();
  try {
    const result = await runReading({ client, mode });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
} else {
  usage();
}
