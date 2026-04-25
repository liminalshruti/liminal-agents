#!/usr/bin/env node
/**
 * URL scheme handler for liminal:// URLs. When the user clicks the
 * evening-close notification (or any other surfacing notification), macOS
 * forwards the URL here via the LiminalSurface.app registered by
 * scripts/register-url-scheme.sh.
 *
 * liminal://close?surfacing_id=<uuid>  -> mark surfacing accepted, print next step.
 */

import { openVault } from "../lib/vault/db.js";
import { log } from "../lib/log.js";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: liminal-surface <url>");
  console.error("Example: liminal-surface liminal://close?surfacing_id=abc-123");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error("ERROR: invalid URL:", raw);
  process.exit(1);
}

if (parsed.protocol !== "liminal:") {
  console.error(`ERROR: expected liminal:// URL, got ${parsed.protocol}`);
  process.exit(1);
}

const kind = parsed.host || parsed.pathname.replace(/^\/+/, "") || "unknown";
const surfacingId = parsed.searchParams.get("surfacing_id");

const db = openVault();
let updated = 0;
if (surfacingId) {
  const r = db
    .prepare(
      `UPDATE surfacing_events SET status = 'accepted' WHERE id = ? AND status = 'pending'`,
    )
    .run(surfacingId);
  updated = r.changes;
}
db.close();

log.info({ kind, surfacingId, updated }, "surface_url_handled");

const next =
  kind === "close"
    ? `run /close${surfacingId ? ` --surfacing-id ${surfacingId}` : ""} in Claude Code`
    : "no-op";

console.log(
  JSON.stringify(
    {
      kind,
      surfacing_id: surfacingId,
      updated,
      next,
    },
    null,
    2,
  ),
);
