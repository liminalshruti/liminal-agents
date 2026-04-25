import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_SCHEMAS = path.resolve(here, "..", "..", "schemas");

export function copySchemas(targetVaultDir) {
  const destDir = path.join(targetVaultDir, "schemas");
  fs.mkdirSync(destDir, { recursive: true });
  const files = fs.readdirSync(REPO_SCHEMAS).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    fs.copyFileSync(path.join(REPO_SCHEMAS, f), path.join(destDir, f));
  }
  return files;
}
