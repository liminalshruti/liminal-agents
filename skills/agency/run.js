#!/usr/bin/env node
/**
 * /agency orchestrator — three bounded agents respond to a single B2B task.
 *
 * The in-lane agent produces work. The others refuse and name the correct
 * agent. Refusal is a designed output, not an error (PPA #4).
 *
 * Usage:
 *   node skills/agency/run.js "<task description>"
 *
 * Writes:
 *   - 1 signal_event (source='user-task', kind='agency-request', register='operational')
 *   - 1 deliberation row (trigger='check', signal_ids=[that signal])
 *   - 3 agent reads stored in analyst_view / sdr_view / auditor_view JSON columns
 *
 * Returns JSON with vault_id and the three reads + per-agent refused flag.
 */

import { openVault } from "../../lib/vault/db.js";
import { newId } from "../../lib/vault/ids.js";
import { runAllAgents } from "../../lib/agents/index.js";
import { makeClientOrExit } from "../../lib/anthropic-client.js";

const taskRaw = process.argv.slice(2).join(" ").trim();
if (!taskRaw) {
  console.error("ERROR: missing task. Example: run.js \"teardown of cofeld.com\"");
  process.exit(1);
}

// URL pre-fetch: if the task contains a URL, fetch its content (homepage HTML
// stripped to text) and pass it as context to the agents. This lets the
// Analyst do real teardowns of sites the model doesn't know, instead of
// refusing-to-fabricate (which is correct behavior but a weaker demo).
//
// Limits: 60KB max body, 5s timeout, only http/https. If fetch fails, the
// agents proceed without context and the Analyst correctly refuses to
// fabricate. Refusal-on-failure is also a valid demo beat — PPA #4.
const URL_RE = /https?:\/\/[^\s)"']+/g;
async function fetchUrlContext(text) {
  const urls = text.match(URL_RE) || [];
  if (urls.length === 0) return null;
  const url = urls[0]; // first URL only
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { url, error: `http ${res.status}` };
    const html = (await res.text()).slice(0, 60_000);
    const text = stripHtml(html).slice(0, 8_000);
    return { url, text, status: res.status };
  } catch (err) {
    return { url, error: err.message };
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Detect domain references like "cofeld.com" without http:// — let the user
// type teardowns naturally. Same fetch path; we just prepend https://.
const BARE_DOMAIN_RE = /\b(?<!\.)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)\b/gi;
const COMMON_TLDS = new Set([
  "com", "io", "ai", "co", "app", "dev", "net", "org", "tech", "xyz",
  "so", "to", "me", "us", "uk", "in", "sh", "page", "site", "tools", "build",
]);

async function maybeFetchBareDomain(text) {
  if (URL_RE.test(text)) return null; // already handled by URL fetch
  const matches = [...text.matchAll(BARE_DOMAIN_RE)].map((m) => m[1].toLowerCase());
  for (const m of matches) {
    const tld = m.split(".").pop();
    if (COMMON_TLDS.has(tld)) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 5000);
        const res = await fetch(`https://${m}`, {
          signal: ac.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        });
        clearTimeout(timer);
        if (!res.ok) return { url: `https://${m}`, error: `http ${res.status}` };
        const html = (await res.text()).slice(0, 60_000);
        const text = stripHtml(html).slice(0, 8_000);
        return { url: `https://${m}`, text, status: res.status };
      } catch (err) {
        return { url: `https://${m}`, error: err.message };
      }
    }
  }
  return null;
}

const fetched = (await fetchUrlContext(taskRaw)) || (await maybeFetchBareDomain(taskRaw));
const fetchedContext = fetched && fetched.text
  ? `URL fetched: ${fetched.url}\n\nPage content (first 8KB):\n${fetched.text}`
  : fetched && fetched.error
    ? `URL fetch failed: ${fetched.url} — ${fetched.error}. Agents should refuse to fabricate.`
    : null;

const db = openVault();
const now = Date.now();

// Record the task as a signal so it shows up in /history
const signalId = newId();
db.prepare(
  `INSERT INTO signal_events (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
   VALUES (?, ?, 'user-task', 'agency-request', 'operational', NULL, ?, 1, 'native')`,
).run(signalId, now, JSON.stringify({ task: taskRaw }));

// Open a deliberation row up front so we can store the in-flight signal_id
const deliberationId = newId();
db.prepare(
  `INSERT INTO deliberations (id, timestamp, trigger, signal_ids, user_state, user_context,
     architect_view, witness_view, contrarian_view, schema_version, vault_origin)
   VALUES (?, ?, 'check', ?, ?, NULL, NULL, NULL, NULL, 1, 'native')`,
).run(
  deliberationId,
  now,
  JSON.stringify([signalId]),
  taskRaw,
);

try {
  const { client, mode } = makeClientOrExit();
  const byName = await runAllAgents(client, taskRaw, fetchedContext);

  const analystText = byName["Analyst"] || "";
  const sdrText = byName["SDR"] || "";
  const auditorText = byName["Auditor"] || "";

  // Store outputs in the existing columns (kept for backward-compat with PR #4 schema).
  // The legacy column names map: architect_view = analyst, witness_view = sdr, contrarian_view = auditor.
  db.prepare(
    `UPDATE deliberations SET architect_view = ?, witness_view = ?, contrarian_view = ? WHERE id = ?`,
  ).run(analystText, sdrText, auditorText, deliberationId);

  console.log(
    JSON.stringify(
      {
        vault_id: deliberationId,
        signal_id: signalId,
        task: taskRaw,
        anthropic_mode: mode,
        fetched: fetched
          ? { url: fetched.url, ok: !fetched.error, bytes: fetched.text?.length || 0 }
          : null,
        analyst: { interpretation: analystText, refused: detectRefusal(analystText) },
        sdr: { interpretation: sdrText, refused: detectRefusal(sdrText) },
        auditor: { interpretation: auditorText, refused: detectRefusal(auditorText) },
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("ERROR calling agent backend:", err.message);
  process.exit(1);
} finally {
  db.close();
}

/**
 * Lightweight refusal heuristic: an agent has refused if it explicitly
 * names another agent's lane in a refusal-shaped sentence. Each agent's
 * system prompt instructs them to refuse with phrasing like
 *   "That's the SDR's lane. I do the research; the SDR runs the move."
 * so we look for the name+lane pattern. Heuristic only — not a hard
 * gate. The TUI uses this to color the refusal pane differently.
 */
function detectRefusal(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const lanePatterns = [
    /that['']s the (analyst|sdr|auditor)['']?s? lane/,
    /the (analyst|sdr|auditor) (does|runs|judges|owns)/,
    /that['']s (an? )?(analyst|sdr|auditor)['']?s? (call|job|work)/,
  ];
  return lanePatterns.some((re) => re.test(t));
}
