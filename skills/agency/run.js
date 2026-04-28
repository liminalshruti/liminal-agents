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
import { runAllAgents, AGENCY_AGENTS } from "../../lib/agents/index.js";
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
// Limits: 60KB max body, 5s timeout, only http/https, no private IPs. If fetch
// fails, the agents proceed without context and the Analyst correctly refuses
// to fabricate. Refusal-on-failure is also a valid demo beat — PPA #4.
//
// SSRF mitigation: hostnames resolving to private IP ranges (RFC1918, link-
// local, loopback, IPv4/IPv6 unique-local) are blocked. This prevents the
// agent from being weaponized to probe internal infrastructure when the
// service is deployed (e.g. on a hackathon judging cloud instance) and a
// user types `/agency teardown of http://169.254.169.254/latest/meta-data/`.
import dns from "node:dns/promises";

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:") ||
    lower.startsWith("ff") ||
    lower.startsWith("::ffff:") // mapped IPv4 — re-check the v4 part
  );
}

async function safeFetch(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: "invalid_url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "non_http_scheme" };
  }
  const host = parsed.hostname;
  // Reject literal private IPs in the URL itself
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { error: "private_ip_blocked" };
  }
  // Resolve hostname and reject if any A/AAAA record is private
  try {
    const records = await dns.lookup(host, { all: true });
    for (const r of records) {
      if (r.family === 4 && isPrivateIPv4(r.address)) {
        return { error: "private_ip_resolved_blocked" };
      }
      if (r.family === 6 && isPrivateIPv6(r.address)) {
        return { error: "private_ip_resolved_blocked" };
      }
    }
  } catch (err) {
    return { error: `dns_failed: ${err.code || err.message}` };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(parsed.toString(), {
      signal: ac.signal,
      redirect: "manual", // do NOT follow — would re-route around our IP check
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      return { error: `http_${res.status}_redirect_blocked` };
    }
    if (!res.ok) return { error: `http ${res.status}` };
    const html = (await res.text()).slice(0, 60_000);
    return { html, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { error: err.message };
  }
}

const URL_RE = /https?:\/\/[^\s)"']+/g;
async function fetchUrlContext(text) {
  const urls = text.match(URL_RE) || [];
  if (urls.length === 0) return null;
  const url = urls[0];
  const result = await safeFetch(url);
  if (result.error) return { url, error: result.error };
  return { url, text: stripHtml(result.html).slice(0, 8_000), status: result.status };
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
      const url = `https://${m}`;
      const result = await safeFetch(url);
      if (result.error) return { url, error: result.error };
      return { url, text: stripHtml(result.html).slice(0, 8_000), status: result.status };
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
  // /agency uses the B2B founder-ops set — Analyst/SDR/Auditor — which
  // refuses out-of-lane via the strict REFUSE: protocol. Pass explicitly so
  // a future change to the default agent set doesn't silently swap voices.
  //
  // runAllAgents returns { byName, errors } per the partial-result contract
  // (see lib/agents/index.js). Destructuring matters: a flat assignment
  // would silently land empty strings in the vault on every run.
  const { byName, errors } = await runAllAgents(client, taskRaw, fetchedContext, {
    agents: AGENCY_AGENTS,
  });

  if (errors.length > 0) {
    console.error(
      `[/agency] ${errors.length}/${AGENCY_AGENTS.length} agents failed; storing partial deliberation`,
    );
    for (const e of errors) {
      console.error(`  - ${e.agent_name}: ${e.reason}`);
    }
  }

  const analystText = byName["Analyst"]?.interpretation || "";
  const sdrText = byName["SDR"]?.interpretation || "";
  const auditorText = byName["Auditor"]?.interpretation || "";

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
        agent_errors: errors,
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
 * Refusal detector — structural, not heuristic.
 *
 * Each agent's prompt declares a strict REFUSAL PROTOCOL: when out of lane,
 * the model emits exactly two lines beginning with "REFUSE: <agent name>".
 * Detection is therefore a prefix check on the first non-blank line.
 *
 * Replaces an earlier pattern-matching detector that searched anywhere in
 * the output for phrases like "the SDR's lane" — which produced false
 * positives when an in-lane agent legitimately mentioned another agent's
 * lane as part of its own work (e.g., the Auditor saying "drafting outreach
 * is the SDR's job" inside its judgment of a draft). Structural marker
 * makes refusal a decision the model emits explicitly, not a phrase the
 * orchestrator infers.
 *
 * If the prompt-imposed protocol drifts (REFUSE embedded mid-paragraph,
 * different casing), the detector errs toward NOT-refused. Better to
 * mislabel a refusal as work than to mislabel work as refusal — the TUI's
 * REFUSED pane is the loud one, and false positives there are the demo
 * failure mode this fix is closing.
 */
function detectRefusal(text) {
  // Inlined regex (not module-level const) because `function` declarations
  // hoist but `const` does not — this function is called from the JSON
  // output above, so any const declared here would TDZ-error at runtime.
  if (!text) return false;
  return /^\s*REFUSE\s*:/.test(text);
}
