#!/usr/bin/env node
/**
 * Render the launchd plist for io.liminal.substrate and write it to disk.
 * Called by scripts/install-daemon.sh.
 */

import fs from "node:fs";
import { renderPlist } from "../lib/launchd/plist.js";

const [, , plistPath, nodePath, scriptPath, logPath] = process.argv;

if (!plistPath || !nodePath || !scriptPath || !logPath) {
  console.error(
    "Usage: write-plist.js <plistPath> <nodePath> <scriptPath> <logPath>",
  );
  process.exit(1);
}

const env = {};
if (process.env.ANTHROPIC_API_KEY) {
  env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
}

const plist = renderPlist({
  label: "io.liminal.substrate",
  nodePath,
  scriptPath,
  logPath,
  env,
});

fs.writeFileSync(plistPath, plist);
console.log(`wrote ${plistPath}`);
