import crypto from "node:crypto";

/**
 * SQLCipher v4 profile.
 *
 * `cipher='sqlcipher'` + `legacy=4` selects the v4 profile, which pins:
 *   AES-256-CBC, 4096-byte pages, HMAC-SHA512 page authentication,
 *   PBKDF2-HMAC-SHA512 KDF with 256k iterations.
 *
 * The expected pragma values are asserted after `applyCipherPragmas` so a
 * future driver upgrade cannot silently regress the profile.
 */
const EXPECTED_PROFILE = {
  cipher: "sqlcipher",
  legacy: 4,
  legacy_page_size: 4096,
  kdf_iter: 256000,
  hmac_algorithm: 2, // 0=SHA1, 1=SHA256, 2=SHA512
  kdf_algorithm: 2,
  hmac_use: 1,
};

const KEY_BYTES = 32;

export function generateVaultKey() {
  return crypto.randomBytes(KEY_BYTES);
}

export function keyFromHex(hex) {
  if (typeof hex !== "string" || hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `vault key must be ${KEY_BYTES * 2} hex chars, got ${typeof hex === "string" ? hex.length : typeof hex}`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("vault key must be hex");
  }
  return Buffer.from(hex, "hex");
}

export function applyCipherPragmas(db, keyBuf) {
  if (!Buffer.isBuffer(keyBuf) || keyBuf.length !== KEY_BYTES) {
    throw new Error(`vault key must be a ${KEY_BYTES}-byte Buffer`);
  }
  db.pragma(`cipher='${EXPECTED_PROFILE.cipher}'`);
  db.pragma(`legacy=${EXPECTED_PROFILE.legacy}`);
  db.pragma(`key="x'${keyBuf.toString("hex")}'"`);
}

export function assertProfile(db) {
  for (const [k, expected] of Object.entries(EXPECTED_PROFILE)) {
    const actual = db.pragma(k, { simple: true });
    if (String(actual) !== String(expected)) {
      throw new Error(
        `SQLCipher profile regression: ${k}=${actual}, expected ${expected}`,
      );
    }
  }
}

export function zeroize(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}
