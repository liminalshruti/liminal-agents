/**
 * Daemon triggers.
 *
 * Only evening-close is implemented: 18:30 local, at least MIN_DAILY_SIGNALS
 * signals since midnight, and no prior 'close' surfacing_event today.
 *
 * Open-loop, stuck, cross-register-conflict, and focus-mode triggers are
 * explicitly out of scope for this cut and return { status: 'stub' }.
 */

import { newId } from "../vault/ids.js";
import { notify } from "../notify/osascript.js";

export const CLOSE_HOUR = 18;
export const CLOSE_MIN = 30;
export const MIN_DAILY_SIGNALS = 5;

export async function runTriggers({ db, now = new Date(), log } = {}) {
  const results = {};
  results.close = await maybeEveningClose({ db, now, log });
  results.open_loop = { status: "stub" };
  results.stuck = { status: "stub" };
  results.cross_register_conflict = { status: "stub" };
  results.focus_mode = { status: "stub" };
  return results;
}

async function maybeEveningClose({ db, now, log }) {
  const hour = now.getHours();
  const min = now.getMinutes();
  const afterClose = hour > CLOSE_HOUR || (hour === CLOSE_HOUR && min >= CLOSE_MIN);
  if (!afterClose) return { triggered: false, reason: "before_close_time" };

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();

  const already = db
    .prepare(
      `SELECT id FROM surfacing_events WHERE trigger = 'close' AND timestamp >= ? LIMIT 1`,
    )
    .get(dayStartMs);
  if (already) return { triggered: false, reason: "already_surfaced_today" };

  const count = db
    .prepare(`SELECT COUNT(*) AS c FROM signal_events WHERE timestamp >= ?`)
    .get(dayStartMs).c;
  if (count < MIN_DAILY_SIGNALS) {
    return { triggered: false, reason: "below_min_signals", signal_count: count };
  }

  const id = newId();
  db.prepare(
    `INSERT INTO surfacing_events
       (id, timestamp, trigger, status, payload, deliberation_id, schema_version, vault_origin)
     VALUES (?, ?, 'close', 'pending', ?, NULL, 1, 'native')`,
  ).run(id, now.getTime(), JSON.stringify({ signal_count: count }));

  const url = `liminal://close?surfacing_id=${encodeURIComponent(id)}`;
  try {
    await notify({
      title: "Liminal",
      message: `End of day. ${count} signals today. Close?`,
      subtitle: "Run /close in Claude Code",
      openUrl: url,
    });
  } catch (err) {
    log?.warn?.({ err: err.message }, "notify_failed");
  }

  return { triggered: true, id, signal_count: count, url };
}
