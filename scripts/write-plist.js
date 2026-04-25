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

const FORWARD_VARS = [
  // Anthropic credential candidates — daemon picks the first one set.
  "ANTHROPIC_API_KEY",
  "CLAUDE_PLUGIN_OPTION_ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_AUTH_TOKEN",
  // Vault env (only set when running in dev/test mode without keyguard binary).
  "LIMINAL_VAULT_KEY",
  // Source overrides used by tests + power users.
  "LIMINAL_GRANOLA_PATH",
  "LIMINAL_POLL_SEC",
];

const env = {};
for (const name of FORWARD_VARS) {
  if (process.env[name]) env[name] = process.env[name];
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
