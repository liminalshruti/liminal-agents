import fs from "node:fs";
import pino from "pino";
import { daemonLogPath, vaultDir } from "./vault/path.js";

fs.mkdirSync(vaultDir(), { recursive: true });

const dest = pino.destination({
  dest: daemonLogPath(),
  sync: false,
  mkdir: true,
});

export const log = pino(
  { base: null, timestamp: pino.stdTimeFunctions.isoTime },
  dest,
);
