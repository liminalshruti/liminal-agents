#!/usr/bin/env node
/**
 * One-shot migration: plaintext vault.db → SQLCipher v4 encrypted vault.db.
 *
 * Detects a plaintext vault by reading the file header. If found, runs
 * `PRAGMA rekey` to re-encrypt the database in place, then verifies the
 * result by reopening with the new key. Idempotent — second run sees an
 * encrypted vault and exits 0.
 */

import fs from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { vaultDbPath } from "../lib/vault/path.js";
import { initKey } from "../lib/vault/keyguard.js";
import { applyCipherPragmas, zeroize } from "../lib/vault/crypto.js";

const PLAINTEXT_MAGIC = Buffer.from("SQLite format 3\0");

export function isPlaintextSqlite(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(PLAINTEXT_MAGIC.length);
    fs.readSync(fd, head, 0, head.length, 0);
    return head.equals(PLAINTEXT_MAGIC);
  } finally {
    fs.closeSync(fd);
  }
}

export function migrateToEncrypted({ logger } = {}) {
  const dbPath = vaultDbPath();
  if (!fs.existsSync(dbPath)) return { migrated: false, reason: "no_vault" };
  if (!isPlaintextSqlite(dbPath)) {
    return { migrated: false, reason: "already_encrypted" };
  }

  const release = initKey();
  const keyHex = release.key.toString("hex");

  const src = new Database(dbPath);
  try {
    src.pragma("cipher='sqlcipher'");
    src.pragma("legacy=4");
    src.pragma(`rekey="x'${keyHex}'"`);
  } finally {
    src.close();
  }

  // Verify the rekey by reopening with the new key.
  const verify = new Database(dbPath);
  try {
    applyCipherPragmas(verify, Buffer.from(keyHex, "hex"));
    verify.pragma("user_version");
  } finally {
    verify.close();
    zeroize(release.key);
  }

  logger?.info?.({ path: dbPath }, "vault_migrated_to_encrypted");
  return { migrated: true, path: dbPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = migrateToEncrypted();
  console.log(JSON.stringify(result, null, 2));
}
