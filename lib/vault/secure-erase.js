import fs from "node:fs";
import crypto from "node:crypto";

const PASSES = 3;
const CHUNK = 64 * 1024;

/**
 * Best-effort secure overwrite. Three passes of random bytes followed by
 * unlink. Not a guarantee against an adversary with raw disk access on
 * a copy-on-write or wear-leveled filesystem — documented in SECURITY.md.
 */
export function secureErase(filePath) {
  if (!fs.existsSync(filePath)) return { erased: false, reason: "absent" };
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return { erased: false, reason: "not_a_file" };

  const size = stat.size;
  const fd = fs.openSync(filePath, "r+");
  try {
    for (let pass = 0; pass < PASSES; pass++) {
      let written = 0;
      while (written < size) {
        const len = Math.min(CHUNK, size - written);
        const buf = crypto.randomBytes(len);
        fs.writeSync(fd, buf, 0, len, written);
        written += len;
      }
      fs.fsyncSync(fd);
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.unlinkSync(filePath);
  return { erased: true, size, passes: PASSES };
}
