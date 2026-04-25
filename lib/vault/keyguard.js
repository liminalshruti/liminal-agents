import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateVaultKey, keyFromHex } from "./crypto.js";
import { vaultDir } from "./path.js";

const KEYGUARD_BIN = path.resolve(
  new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "bin",
  "liminal-keyguard",
);

const MODE_FILE = () => path.join(vaultDir(), "keyguard.mode");

/**
 * Three key-release modes:
 *   - env       LIMINAL_VAULT_KEY=<64 hex> set; tests and CI use this.
 *   - sep       Apple Silicon Secure Enclave-backed wrap. Touch ID prompts.
 *   - keychain  Intel Mac fallback; Keychain ACL only.
 *
 * Returns a Buffer the caller MUST zeroize after handing to SQLCipher.
 */

export function unwrapKey() {
  if (process.env.LIMINAL_VAULT_KEY) {
    return { key: keyFromHex(process.env.LIMINAL_VAULT_KEY), mode: "env" };
  }
  if (!keyguardAvailable()) {
    throw new Error(
      "vault key release requires LIMINAL_VAULT_KEY env or a built liminal-keyguard binary",
    );
  }
  const mode = readMode();
  const out = runKeyguard(["unwrap"]);
  if (out.status !== 0) {
    throw new Error(`keyguard unwrap failed: ${out.stderr.toString().trim()}`);
  }
  if (out.stdout.length !== 32) {
    throw new Error(
      `keyguard returned ${out.stdout.length} bytes, expected 32`,
    );
  }
  return { key: Buffer.from(out.stdout), mode };
}

export function initKey() {
  if (process.env.LIMINAL_VAULT_KEY) {
    return { key: keyFromHex(process.env.LIMINAL_VAULT_KEY), mode: "env" };
  }
  if (!keyguardAvailable()) {
    throw new Error(
      "vault initialization requires LIMINAL_VAULT_KEY env or a built liminal-keyguard binary",
    );
  }
  const key = generateVaultKey();
  const out = runKeyguard(["init"], key);
  if (out.status !== 0) {
    throw new Error(`keyguard init failed: ${out.stderr.toString().trim()}`);
  }
  const mode = readMode();
  return { key, mode };
}

export function deleteKey() {
  if (process.env.LIMINAL_VAULT_KEY) return { mode: "env" };
  if (!keyguardAvailable()) return { mode: "absent" };
  const out = runKeyguard(["delete"]);
  if (out.status !== 0) {
    throw new Error(`keyguard delete failed: ${out.stderr.toString().trim()}`);
  }
  try {
    fs.unlinkSync(MODE_FILE());
  } catch {
    // tolerate
  }
  return { mode: "deleted" };
}

export function rotateKey() {
  if (process.env.LIMINAL_VAULT_KEY) {
    throw new Error("cannot rotate when key is supplied via env");
  }
  if (!keyguardAvailable()) {
    throw new Error("rotate requires the keyguard binary");
  }
  const newKey = generateVaultKey();
  const out = runKeyguard(["rotate"], newKey);
  if (out.status !== 0) {
    throw new Error(`keyguard rotate failed: ${out.stderr.toString().trim()}`);
  }
  return { key: newKey };
}

export function keyguardAvailable() {
  return fs.existsSync(KEYGUARD_BIN);
}

export function keyguardBinPath() {
  return KEYGUARD_BIN;
}

function readMode() {
  try {
    return fs.readFileSync(MODE_FILE(), "utf8").trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function runKeyguard(args, stdinBuf) {
  return spawnSync(KEYGUARD_BIN, args, {
    input: stdinBuf,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60_000,
  });
}
