import path from "node:path";
import os from "node:os";

export function vaultDir() {
  if (process.env.LIMINAL_VAULT_DIR) return process.env.LIMINAL_VAULT_DIR;
  return path.join(os.homedir(), "Library", "Application Support", "Liminal");
}

export function vaultDbPath() {
  return path.join(vaultDir(), "vault.db");
}

export function integrationsConfigPath() {
  return path.join(vaultDir(), "integrations.json");
}

export function integrationsCacheDir(source) {
  return path.join(vaultDir(), "integrations", source);
}

export function daemonLogPath() {
  return path.join(vaultDir(), "daemon.log");
}

export function schemasDir() {
  return path.join(vaultDir(), "schemas");
}

export function legacyVaultPath() {
  return path.join(os.homedir(), ".liminal-agents-vault.db");
}
