import fs from "node:fs";
import { integrationsConfigPath, vaultDir } from "../vault/path.js";

const DEFAULTS = Object.freeze({
  schema_version: 1,
  sources: {
    "claude-code": { enabled: true, poll_interval_sec: 300 },
    "git": { enabled: true, poll_interval_sec: 300, paths: [] },
    "granola": { enabled: true, poll_interval_sec: 300 },
    "calendar": { enabled: false, status: "stub" },
    "knowledgeC": { enabled: false, status: "stub" },
    "imessage": { enabled: false, status: "stub" },
    "obsidian": { enabled: false, status: "stub" },
  },
});

export function defaultIntegrations() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

export function readIntegrations() {
  const p = integrationsConfigPath();
  if (!fs.existsSync(p)) return defaultIntegrations();
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return defaultIntegrations();
  }
}

export function writeIntegrations(cfg) {
  fs.mkdirSync(vaultDir(), { recursive: true });
  fs.writeFileSync(integrationsConfigPath(), JSON.stringify(cfg, null, 2));
}

export function ensureIntegrations() {
  const p = integrationsConfigPath();
  if (!fs.existsSync(p)) {
    writeIntegrations(defaultIntegrations());
    return readIntegrations();
  }
  const cfg = readIntegrations();
  const migrated = migrateStubsToReal(cfg);
  if (migrated) writeIntegrations(cfg);
  return cfg;
}

const REAL_SOURCES_NOW = ["granola"];

function migrateStubsToReal(cfg) {
  if (!cfg?.sources) return false;
  let changed = false;
  for (const name of REAL_SOURCES_NOW) {
    const s = cfg.sources[name];
    if (s && s.status === "stub") {
      cfg.sources[name] = { enabled: true, poll_interval_sec: 300 };
      changed = true;
    }
  }
  return changed;
}
