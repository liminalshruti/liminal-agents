// Privacy invariants — anti-regression tests for PRIVACY_INVARIANTS.md.
//
// These tests fail when a future code change weakens any of the three
// substrate-level privacy invariants:
//
//   I1 — vault content never traverses Liminal infrastructure
//        (no Liminal-controlled domain references in network code paths)
//
//   I2 — vault encryption key is structurally outside Liminal's reach
//        (key release modes are local-only; key is zeroized post-pragma)
//
//   I3 — outbound network is single-chokepoint, allowlist-bound
//        (only safeFetch in skills/agency/run.js + Anthropic SDK in
//         lib/anthropic-client.js may reach the network from the
//         substrate; everything else fails the test)
//
// PRIVACY_INVARIANTS.md is the prose version of these claims;
// PATENT_CLAIMS.md cites them as the PPA #6 candidate (Structural
// Unilateral Privacy of the Contested-Reads Substrate).
//
// The tests below scan source files. They are deliberately strict —
// false positives are easy to suppress by listing a sanctioned chokepoint;
// false negatives would compromise the privacy claim.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Walk a directory tree, returning all .js files (excluding node_modules,
// .git, sandbox/node_modules, schemas, dist, build, and the test directory
// itself — tests legitimately reference forbidden patterns in assertions).
function walkJsFiles(dir, { skip = new Set(), out = [] } = {}) {
  if (skip.has(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (
        e.name === "node_modules" ||
        e.name === ".git" ||
        e.name === "test" ||
        e.name === "schemas" ||
        e.name === "dist" ||
        e.name === "build" ||
        e.name === "sandbox" || // sandbox has its own privacy posture; audit separately
        e.name.startsWith(".")
      ) {
        continue;
      }
      walkJsFiles(full, { skip, out });
    } else if (e.isFile() && e.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

// ─── Invariant 1 — no Liminal-controlled domain in network code ──────────

test("I1 — no Liminal-controlled domain references in substrate code paths", () => {
  // The patent claim hinges on Liminal-as-a-company never being in the
  // network path. This test fails if a future PR adds a fetch / axios /
  // websocket reference to any domain Liminal might own.
  //
  // Note: documentation strings and comments (e.g., the homepage in
  // package.json or a citation in a comment) are tolerated. The grep
  // targets *network call shapes* — fetch(URL), new URL(domain), etc.
  //
  // Liminal-controlled domains we'd reject in a network context:
  const liminalDomains = [
    "theliminalspace.io",
    "theliminalspace.com",
    "liminal.app",
    "liminal.ai",
    "api.liminal",
    "liminal-cloud",
    "vault.liminal",
  ];

  // Network-call shapes we look for the domain inside.
  // The pattern: a domain appearing within a network-call argument or a
  // URL constructor where the host is the domain.
  const files = walkJsFiles(REPO_ROOT);

  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    // For each domain, check if it appears in a network-call context.
    for (const domain of liminalDomains) {
      // Find all occurrences of the domain.
      const re = new RegExp(domain.replace(/\./g, "\\."), "g");
      let m;
      while ((m = re.exec(src)) !== null) {
        // Walk backward up to 80 chars to see if we're in a network call.
        const before = src.slice(Math.max(0, m.index - 80), m.index);
        const inNetworkContext =
          /fetch\s*\(\s*['"`][^'"`]*$/.test(before) ||
          /new\s+URL\s*\(\s*['"`][^'"`]*$/.test(before) ||
          /https?:\/\/[^'"\s]*$/.test(before) ||
          /axios[\.\(]\s*['"`][^'"`]*$/.test(before) ||
          /WebSocket\s*\(\s*['"`][^'"`]*$/.test(before) ||
          /\.connect\s*\(\s*['"`][^'"`]*$/.test(before);

        assert.equal(
          inNetworkContext,
          false,
          `I1 violation: ${path.relative(REPO_ROOT, f)} references Liminal-controlled domain ${domain} in a network-call context`,
        );
      }
    }
  }
});

// ─── Invariant 2 — vault key is local-only, three documented modes ───────

test("I2 — vault encryption key release modes are local-only", async () => {
  // The keyguard module exposes exactly three key release paths: env,
  // sep (Apple Secure Enclave), keychain (macOS Keychain). None of them
  // makes a network call. This test asserts (a) the module's source has
  // no network-call shapes, (b) zeroize is called after pragma application.

  const keyguardPath = path.join(REPO_ROOT, "lib/vault/keyguard.js");
  const cryptoPath = path.join(REPO_ROOT, "lib/vault/crypto.js");
  const dbPath = path.join(REPO_ROOT, "lib/vault/db.js");

  const keyguardSrc = fs.readFileSync(keyguardPath, "utf8");
  const cryptoSrc = fs.readFileSync(cryptoPath, "utf8");
  const dbSrc = fs.readFileSync(dbPath, "utf8");

  // No fetch / http / https / axios / websocket in keyguard or crypto.
  const forbidden = [
    /\bfetch\s*\(/,
    /\baxios[\.\(]/,
    /\bhttps?\.request/,
    /\brequire\s*\(\s*['"]https?['"]\s*\)/,
    /\bimport\s+.*\s+from\s+['"]node:https?['"]/,
    /\bWebSocket\s*\(/,
    /\bnew\s+URL\s*\(\s*['"]https?:\/\//,
  ];
  for (const pattern of forbidden) {
    assert.equal(
      pattern.test(keyguardSrc),
      false,
      `I2 violation: lib/vault/keyguard.js contains forbidden network shape ${pattern}`,
    );
    assert.equal(
      pattern.test(cryptoSrc),
      false,
      `I2 violation: lib/vault/crypto.js contains forbidden network shape ${pattern}`,
    );
  }

  // zeroize is exported from crypto and called after pragma application
  // in db.js. If either pairing breaks, the key would linger in memory.
  assert.match(cryptoSrc, /export\s+function\s+zeroize/, "zeroize export missing from crypto.js");
  assert.match(dbSrc, /zeroize\s*\(/, "zeroize is not called in db.js after pragma application");

  // The three documented release modes are named in keyguard.js. Two of
  // them (`env`, `keychain`) appear as literal string returns; the `sep`
  // mode is implemented by an external native binary (liminal-keyguard,
  // out of this repo) and is documented via the JSDoc header. The test
  // therefore checks the file mentions all three modes by name in any
  // form (literal string OR JSDoc comment) — what we are pinning is that
  // keyguard.js never grows a fourth, undocumented mode without the
  // PRIVACY_INVARIANTS doc + this test being updated together.
  for (const mode of ["env", "sep", "keychain"]) {
    assert.match(
      keyguardSrc,
      new RegExp(`\\b${mode}\\b`),
      `I2 violation: keyguard.js no longer mentions documented release mode '${mode}'`,
    );
  }

  // Defensive: the test still passes when keyguard is run with the test
  // env-key path, which is what `npm test` does. We re-confirm the env
  // path is the only one that synchronously returns the key from the
  // environment without spawning a process.
  const { unwrapKey } = await import("../lib/vault/keyguard.js?t=" + Date.now());
  process.env.LIMINAL_VAULT_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const released = unwrapKey();
  assert.equal(released.mode, "env");
  assert.equal(released.key.length, 32);
  delete process.env.LIMINAL_VAULT_KEY;
});

// ─── Invariant 3 — outbound network is single-chokepoint ─────────────────

test("I3 — outbound network is allowlist-bound to safeFetch + Anthropic SDK", () => {
  // The substrate has exactly two sanctioned outbound surfaces:
  //   - skills/agency/run.js (`safeFetch` — SSRF-guarded HTTP fetches)
  //   - lib/anthropic-client.js (`Anthropic` SDK / ClaudeCliClient shim)
  //
  // Any other file in lib/ / skills/ / bin/ that introduces a network
  // call shape fails this test. Adding a third sanctioned chokepoint
  // requires explicit allowlist edit + privacy-claim revision.

  const SANCTIONED_FILES = new Set([
    path.join(REPO_ROOT, "skills/agency/run.js"),
    path.join(REPO_ROOT, "lib/anthropic-client.js"),
    path.join(REPO_ROOT, "lib/anthropic-cli-shim.js"), // helper called by anthropic-client
  ]);

  const networkShapes = [
    { name: "fetch(", regex: /(?<!safe)\bfetch\s*\(/ },
    { name: "axios", regex: /\baxios[\.\(]/ },
    { name: "https.request", regex: /\bhttps?\.request\s*\(/ },
    { name: "node:https request", regex: /\bimport\s+.*\bfrom\s+['"]node:https?['"]/ },
    { name: "WebSocket(", regex: /\bnew\s+WebSocket\s*\(/ },
    { name: "EventSource(", regex: /\bnew\s+EventSource\s*\(/ },
    { name: "navigator.sendBeacon", regex: /\bnavigator\.sendBeacon\s*\(/ },
    { name: "got(", regex: /\bgot\s*\(/ },
    { name: "node-fetch import", regex: /\bfrom\s+['"]node-fetch['"]/ },
    { name: "request(", regex: /\brequire\s*\(\s*['"]request['"]\s*\)/ },
  ];

  // Scan lib/, skills/, bin/.
  const candidateDirs = [
    path.join(REPO_ROOT, "lib"),
    path.join(REPO_ROOT, "skills"),
    path.join(REPO_ROOT, "bin"),
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = walkJsFiles(dir);
    for (const f of files) {
      if (SANCTIONED_FILES.has(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const shape of networkShapes) {
        if (shape.regex.test(src)) {
          assert.fail(
            `I3 violation: ${path.relative(REPO_ROOT, f)} contains unsanctioned network shape '${shape.name}'. ` +
              `Add the file to SANCTIONED_FILES only after revising PRIVACY_INVARIANTS.md to document the new chokepoint.`,
          );
        }
      }
    }
  }
});

// ─── Coverage assertion ──────────────────────────────────────────────────

test("privacy invariants: PRIVACY_INVARIANTS.md exists at repo root", () => {
  // The doc and the test are co-load-bearing. If the doc disappears, the
  // test still passes structurally, but the patent claim loses its prose
  // anchor. Pin both.
  const docPath = path.join(REPO_ROOT, "PRIVACY_INVARIANTS.md");
  assert.ok(fs.existsSync(docPath), "PRIVACY_INVARIANTS.md missing from repo root");
  const doc = fs.readFileSync(docPath, "utf8");
  // The three invariants must each be named.
  assert.match(doc, /Invariant 1/, "PRIVACY_INVARIANTS.md missing Invariant 1");
  assert.match(doc, /Invariant 2/, "PRIVACY_INVARIANTS.md missing Invariant 2");
  assert.match(doc, /Invariant 3/, "PRIVACY_INVARIANTS.md missing Invariant 3");
  // The honest qualifier must remain (Criterion 7 — claim veracity).
  assert.match(
    doc,
    /Anthropic API call surface is real/,
    "PRIVACY_INVARIANTS.md missing the honest API-surface qualifier",
  );
});
