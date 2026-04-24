#!/usr/bin/env node
/**
 * One-shot setup: create vault dir, run schema init + legacy import,
 * write default integrations.json if absent. Safe to re-run.
 */

import { openVault } from "../lib/vault/db.js";
import { ensureIntegrations } from "../lib/config/integrations.js";
import {
  vaultDir,
  vaultDbPath,
  integrationsConfigPath,
  daemonLogPath,
} from "../lib/vault/path.js";

const db = openVault();
const cfg = ensureIntegrations();
db.close();

const enabled = Object.entries(cfg.sources || {})
  .filter(([, v]) => v.enabled)
  .map(([k]) => k);
const stubbed = Object.entries(cfg.sources || {})
  .filter(([, v]) => !v.enabled)
  .map(([k]) => k);

console.log("liminal substrate ready");
console.log(`  vault dir:   ${vaultDir()}`);
console.log(`  vault db:    ${vaultDbPath()}`);
console.log(`  integrations: ${integrationsConfigPath()}`);
console.log(`  daemon log:  ${daemonLogPath()}`);
console.log(`  enabled:     ${enabled.join(", ") || "(none)"}`);
console.log(`  not yet implemented: ${stubbed.join(", ") || "(none)"}`);
