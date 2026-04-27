// Bounded URL fetch tool — gives the Analyst (and only the Analyst) access
// to external content. SSRF-guarded.
//
// The architectural claim this supports: tools are scoped per-agent. The
// Analyst's domain is "what is known, in primary sources" — so the
// Analyst gets fetch capability. The SDR's domain is "the first move,
// cold open" — the SDR does NOT get fetch capability. If you ask the
// SDR to fetch a URL, the SDR refuses to Analyst (existing bounded
// refusal protocol).
//
// This makes capability — not just voice — part of the bounded-agent
// definition.

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 32_768; // ~32KB after HTML strip

// SSRF guard: reject private/loopback/link-local/cloud-metadata IPs.
// Mirrors the production logic in lib/agency/run.js (PR #9 SSRF hardening).
const PRIVATE_IPV4_PATTERNS = [
  /^127\./,                    // loopback
  /^10\./,                     // RFC1918
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // RFC1918
  /^192\.168\./,               // RFC1918
  /^169\.254\./,               // link-local incl. cloud metadata
  /^0\./,                      // 0.0.0.0/8
  /^255\./,                    // broadcast
];

function isPrivateIPv4(host) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return PRIVATE_IPV4_PATTERNS.some((p) => p.test(host));
}

function isPrivateIPv6(host) {
  // Strip brackets if present.
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1") return true;                    // loopback
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("fe80:")) return true;          // link-local
  return false;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    return { ok: false, error: `invalid URL: ${e.message}` };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: `protocol not allowed: ${url.protocol}` };
  }

  const host = url.hostname;
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { ok: false, error: `private IP rejected: ${host}` };
  }

  // Block obviously-internal hostnames as a soft layer (the IP check is
  // the load-bearing one; this catches lazy mistakes).
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: `internal hostname rejected: ${host}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "manual", // do not auto-follow — protects against SSRF via redirect
      signal: controller.signal,
      headers: {
        "User-Agent": "liminal-agents/0.1 (+https://github.com/liminalshruti/liminal-agents)",
        Accept: "text/html, text/plain, application/json",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: `redirect not followed: status=${response.status} location=${response.headers.get("location") || ""}` };
    }
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    const truncated = buffer.byteLength > MAX_BYTES;
    const slice = buffer.slice(0, MAX_BYTES);
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(slice);

    let text = decoded;
    if (contentType.includes("text/html")) {
      text = stripHtml(decoded);
    }
    // Truncate again post-strip in case stripping added whitespace.
    text = text.slice(0, MAX_BYTES);

    return {
      ok: true,
      url: url.toString(),
      status: response.status,
      content_type: contentType,
      truncated,
      bytes: buffer.byteLength,
      text,
    };
  } catch (e) {
    if (e.name === "AbortError") {
      return { ok: false, error: `fetch timed out after ${FETCH_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: `fetch error: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// Anthropic-tool-use schema declaration. The orchestrator passes this
// to client.messages.create() when an agent has fetch_url in its tool
// allowlist.
export const FETCH_URL_TOOL = {
  name: "fetch_url",
  description:
    "Fetch the content of a public HTTPS URL and return its text. Use this to get primary-source content for diligence. Returns up to 32KB of stripped text. Refuses private IPs and internal hostnames.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch. Must be http(s) and not a private/internal IP.",
      },
    },
    required: ["url"],
  },
};

// Tool registry — keyed by tool name (matches Anthropic tool_use convention).
export const TOOLS = {
  fetch_url: { schema: FETCH_URL_TOOL, run: ({ url }) => fetchUrl(url) },
};
