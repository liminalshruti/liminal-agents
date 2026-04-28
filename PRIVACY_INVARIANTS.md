# PRIVACY_INVARIANTS.md — what cannot leave the device, and why

Three named invariants the substrate enforces. Each is structurally
true (not a policy promise) and code-checkable (not advisory). Each is
backed by a runtime test in `test/privacy-invariants.test.js` that
fails if a future change weakens the invariant.

This file exists because Liminal's product premise — typed
longitudinal records of contested reads of the user's own state —
requires a holding container the user can trust with material they
wouldn't share with another human. Cloud-first AI products can
*promise* not to read user data; they cannot *structurally enforce* the
promise. Local-first encrypted-vault architecture turns the promise
into a property.

The patent claim PPA #6 (working name: Structural Unilateral Privacy
of the Contested-Reads Substrate) hangs on these three invariants
holding together.

---

## What is and is not on the device

**On-device only, never transmitted:**
- Vault rows: signal_events, deliberations, agent_views, corrections, surfacing_events.
- Vault encryption key (held in Apple Secure Enclave, macOS Keychain, or a user-supplied env var; never sent over the network).
- User correction text and tags.
- Source ingest content (Granola transcripts, Claude Code sessions, git commits, Cursor logs).
- Refinement and retrieval queries against the vault.

**Transmitted, with explicit user authorization:**
- Outbound to `api.anthropic.com` (or the user's `claude` CLI subscription endpoint, if that mode is selected): the synthesized state + agent task prompt + agent system prompt, exactly the inputs a single Anthropic API call requires. The user controls the credential (`ANTHROPIC_API_KEY` or `claude setup-token`); the user can verify what is sent by inspecting the SDK call sites.
- One outbound HTTP fetch from `safeFetch` in `skills/agency/run.js` when the agency surface receives a URL or bare-domain task. The fetch is SSRF-guarded (private-IP block, redirect-manual, 5s timeout, non-HTTP scheme rejection) and the user invoked the agency surface explicitly.

**Never transmitted to Liminal as a company:**
- Anything. There is no Liminal-owned server, no telemetry endpoint, no "phone home" path. The codebase contains zero references to a Liminal-controlled domain. The encryption key is never accessible to Liminal under any code path.

This is the EDR-claim sentence in technical form:

> The source application sees a window-paste event. EDR sees the user
> using their tools normally. Liminal's read against those tools never
> leaves the device — except as inputs to a Claude API call the user
> authorized with their own credential.

---

## Three invariants

### Invariant 1 — Vault content never traverses Liminal infrastructure

**Claim.** No vault row (signal_events, deliberations, agent_views, corrections, surfacing_events, plus future events on the phase1 substrate) is sent to a Liminal-controlled server. There is no Liminal-controlled server. Anthropic-bound API calls do transmit synthesized state + prompts as the inference payload, but those flow user → Anthropic via the user's own API key; Liminal as a company is not in the path.

**Where enforced in code.**

| Element | File | Lines |
|---|---|---|
| Single outbound HTTP chokepoint | `skills/agency/run.js` (`safeFetch`) | 74-127 |
| Single outbound LLM chokepoint | `lib/anthropic-client.js` | full file |
| Vault DB is local SQLite + SQLCipher | `lib/vault/db.js` | 78-106 |
| Vault path is local-only | `lib/vault/path.js` | full file |
| No Liminal domain references | repo-wide grep, anti-regression test | `test/privacy-invariants.test.js` |

**Anti-regression test.** A repo-wide grep that fails if the codebase
introduces references to any Liminal-controlled domain
(`theliminalspace.io`, `liminal.app`, `*.liminal.*`) in a network
context (fetch URL, axios call, websocket, etc.) — not in
documentation strings. This invariant is the load-bearing claim for
the SR007 moat sentence and the EDR sentence.

---

### Invariant 2 — Vault encryption key is structurally outside Liminal's reach

**Claim.** The vault key never reaches any Liminal server (because there is no Liminal server, see Invariant 1) AND the key never even has to leave the user's hardware secure element on supported devices. Three release modes, none of which involve a Liminal-controlled key escrow:

- `env` mode — `LIMINAL_VAULT_KEY` env var; user controls the var; tests use this.
- `sep` mode (Apple Silicon) — Secure Enclave-wrapped key; Touch ID prompts; key material is never in user-space memory longer than the SQLCipher pragma application call.
- `keychain` mode (Intel Mac fallback) — macOS Keychain ACL-protected key.

After the SQLCipher pragma application, the key Buffer is **zeroized**
(`crypto.js:61-63`). The key cannot be recovered from process memory
after vault open even by code on the same machine.

**Where enforced in code.**

| Element | File | Lines |
|---|---|---|
| Three key-release modes | `lib/vault/keyguard.js` | 17-94 |
| Cipher pragma application + zeroize | `lib/vault/db.js` | 84-91 |
| zeroize() implementation | `lib/vault/crypto.js` | 61-63 |
| SQLCipher v4 profile asserted | `lib/vault/crypto.js` | 50-59 |
| 32-byte key generation via crypto.randomBytes | `lib/vault/crypto.js` | 25-27 |

**Anti-regression test.** Confirms `keyguard.js` exposes only the
three documented modes, that each mode's key path is local (no
HTTP/HTTPS), and that `zeroize` is called after every successful
pragma application. Existing `test/vault-crypto.test.js` already
covers profile assertion + malformed-key rejection; the new test
covers the *transmission-impossibility* property specifically.

---

### Invariant 3 — Outbound network is single-chokepoint, allowlist-bound

**Claim.** All outbound network calls in the substrate flow through one of two named chokepoints:

- `safeFetch` in `skills/agency/run.js` for HTTP fetches (URL pre-fetch on agency tasks).
- `Anthropic` SDK / `ClaudeCliClient` shim in `lib/anthropic-client.js` for LLM inference.

There are no other outbound network calls. A user (or auditor, or
penetration tester) can verify the property by running the substrate
under network monitoring and confirming traffic only to
`api.anthropic.com` / a user-specified URL the agent surface fetched /
nothing else. The c-soft anti-regression suite already pins
`safeFetch` as the only `fetch(` call in `skills/agency/run.js` (test
`test/patent-claims.test.js` Test 4); the new invariant test extends
this to all of `lib/` and `skills/`.

**Where enforced in code.**

| Element | File | Lines |
|---|---|---|
| safeFetch chokepoint with SSRF guards | `skills/agency/run.js` | 46-127 |
| Anthropic chokepoint | `lib/anthropic-client.js` | full file |
| Existing chokepoint test (agency) | `test/patent-claims.test.js` | Test 4 |
| Substrate-wide chokepoint test | `test/privacy-invariants.test.js` | (new) |

**Anti-regression test.** Greps `lib/`, `skills/`, `bin/` for any
`fetch(`, `https.request`, `http.request`, `XMLHttpRequest`, `axios`,
`got(`, `node-fetch`, websocket, EventSource, `navigator.sendBeacon`
calls outside the named chokepoints. Fails on first violation. This
is the test that makes the EDR sentence *verifiable* against future
codebase changes — a future PR cannot accidentally add a third
outbound path without the test failing in CI.

---

## What this is not

For Criterion 7 honesty:

1. **This is not a guarantee against operator-class attack.** A user with root on the same machine can read the vault; encryption protects against device theft, opportunistic readers, and discovery / subpoena scenarios where the device is imaged but the key is unavailable. It does not protect against an attacker who controls the running OS.

2. **This is not a Common Criteria / FedRAMP / SOC2 attestation.** The crypto parameters (AES-256-CBC + HMAC-SHA512 + PBKDF2 256k iterations) meet FIPS 140-2 module-cipher expectations; the *system* has not been formally certified. A defense-IC buyer would treat the parameters as evidence-to-validate, not certification.

3. **The Anthropic API call surface is real.** Synthesized state + prompts do leave the device when an agent reads. The user authorizes this with their own credential. If the user revokes the credential (or has none), agents do not run; the vault stays inert. This is the property the SR007 sentence "Liminal's read against those tools never leaves the device" needs to qualify when the audience is sophisticated: *the agent inference call leaves the device along the user-controlled credential path; vault rows do not*. The patent claim survives this distinction; the marketing sentence may need to honor it.

4. **Phase1 substrate (events.js + future Phase 4/5 features per PRODUCT_DATA_MODEL.md) preserves these invariants by design.** Embeddings are nullable in v0.1. Cryptographic signatures are nullable in v0.1. The substrate canon explicitly forbids cloud round-trips for Phase 1. If a future phase introduces sync/multi-device, these invariants will need explicit revision and the claim will degrade from structural to policy. That decision is on Shruti's roadmap, not in code today.

---

## Founder commitment

The product cannot ship cross-device sync, multi-user vault sharing,
team accounts, browser-based vault reading, or vendor-side telemetry
on user behavior **without explicitly degrading the invariants in this
file** and updating the PATENT_CLAIMS surface to match. Future
features that need any of those properties either:

- a) ship as separate, explicitly-cloud products with different brand
  + pricing, leaving the local vault untouched, OR
- b) introduce end-to-end-encrypted sync where Liminal's server is
  blind to vault content (technically harder; preserves the patent
  claim), OR
- c) ship with the privacy claim explicitly weakened in product
  copy + investor materials (cheaper; weakens commercial register).

The decision is named in advance so it does not happen accidentally.

---

## References

- `PATENT_CLAIMS.md` — three structural claims (PPA #4, #5, snapshot-set hash) + this file's invariants as PPA #6 candidate.
- `SECURITY.md` — vault threat model.
- `~/liminal/founder-brain/liminal-ip/03-architecture/PRODUCT_DATA_MODEL.md` — append-only event log substrate canon (Phase 1 → 5).
- `test/privacy-invariants.test.js` — the test that fails when an invariant weakens.
