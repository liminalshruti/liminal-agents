import fs from "node:fs";
import path from "node:path";
import { integrationsCacheDir } from "../vault/path.js";

function cursorPath(source) {
  return path.join(integrationsCacheDir(source), "cursor.json");
}

export function readCursor(source) {
  const p = cursorPath(source);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

export function writeCursor(source, data) {
  fs.mkdirSync(integrationsCacheDir(source), { recursive: true });
  fs.writeFileSync(cursorPath(source), JSON.stringify(data, null, 2));
}
