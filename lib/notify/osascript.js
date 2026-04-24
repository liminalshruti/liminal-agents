/**
 * macOS notifications via osascript. On non-macOS hosts, falls through to
 * stdout so the daemon still logs its intent.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExec = promisify(execFile);

function escape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

export async function notify({ title = "Liminal", message = "", subtitle, openUrl } = {}) {
  const script = subtitle
    ? `display notification "${escape(message)}" with title "${escape(title)}" subtitle "${escape(subtitle)}"`
    : `display notification "${escape(message)}" with title "${escape(title)}"`;
  try {
    await pExec("osascript", ["-e", script]);
    return { delivered: "osascript", url: openUrl || null };
  } catch {
    console.log(`[notify] ${title}: ${message}${openUrl ? " -> " + openUrl : ""}`);
    return { delivered: "stdout", url: openUrl || null };
  }
}
