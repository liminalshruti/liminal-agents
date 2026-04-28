# PATENT_CLAIMS.md — what is novel, where it lives in code

A five-minute tour of the IP claims this codebase carries. Inspectable
without reading the agent prose. File:line citations are stable on
`main`; verify with `git show <ref>:<path>` if pinning.

This file is for partners, technical investors, IP counsel, and
contributors orienting to the structural claims. It is intentionally
short. Read alongside `ARCHITECTURE.md` (synthesis surface),
`SECURITY.md` (threat model), and `SPEC.md` (operating spec).

---

## Three structural claims

### Claim 1 — Bounded Agent Refusal Architecture (PPA #4)

A multi-agent system in which each agent has an explicit, declared
domain and anti-domain mapped to an archetypal `(hour, face)`
coordinate on a 12-position polarity geometry; the agent's REFUSAL is
a designed first-class output, not a fallback or error; refusals route
to a named peer agent drawn from a *geometry-derived* allowlist
constructed at module-load time from the agent's geometric and
attitudinal opposites; vector-isolated agents (no structurally
adjacent peer in the active set) fall back to the full peer set with
explicit notation; the model cannot invent agent names because the
allowlist is pinned in the prompt and runtime classification flags
out-of-vector targets as `geometry_violation`.

**Why novel.** The dominant pattern in production agent systems is
"omniscient agent" — one model attempts every task, hallucinating when
out of depth. Liminal's agents *refuse* when out of domain and *name*
the correct agent. Refusal increases trust because it surfaces system
boundaries the user can verify. The structural defensibility comes
from the geometry: the bound is not "every other agent" but the small
set of agents whose archetypal position is structurally adjacent — the
domain-cross redirect (180° around the clock, same face) and the
attitude-cross redirect (same hour, opposite face).

**Where enforced in code (introspective surface, c-hard-iii landed).**

| Element | File | Lines |
|---|---|---|
| Two-axis archetypal geometry helpers | `lib/agents/archetype-base.js` | full file |
| Bound construction (Option A — geometry-bound + vector-isolated fallback) | `lib/agents/bounded-system-prompt.js` | 64-118 |
| Allowlist composition at module-load | `lib/agents/index.js` | 65-67 |
| Per-agent (hour, face) typing | `lib/agents/{architect,witness,contrarian,strategist,economist,physician,child,historian,cartographer,elder,mystic,betrayer}.js` | each file (lines 4-5) |
| Refusal classifier with geometry check | `lib/agents/validation.js` | 41-104 |
| Structural refusal detector (prefix-check) | `skills/agency/run.js` | 297-303 |
| `describeBound` diagnostic (used by tests) | `lib/agents/bounded-system-prompt.js` | 122-141 |
| Geometry-binding tests (Layer 3) | `test/geometry-binding.test.js` | full file |
| Coverage planning artifact | `CHARD3_PLAN.md` | full file |

**Frozen taxonomies that bound the claim.**
- 12 introspective agents in 4 registers — `lib/agents/index.js:54-59`
- REFUSAL PROTOCOL exact format — `lib/agents/bounded-system-prompt.js:115-122`
- 6 classification kinds (incl. `geometry_violation`) — `lib/agents/validation.js:32-49`
- 12 archetypal hours (HOURS) — `lib/agents/archetype-base.js:55-69`
- 2 faces (FACES) — `lib/agents/archetype-base.js:71`

**Coverage at landing.**

| Agent | (Hour, Face) | Bound kind |
|---|---|---|
| Architect | (10, inner) | vector-isolated |
| Strategist | (5, inner) | geometry-bound: Elder, Historian |
| Economist | (5, inner) | geometry-bound: Elder, Historian |
| Witness | (12, inner) | vector-isolated |
| Physician | (8, inner) | geometry-bound: Cartographer |
| Child | (1, inner) | geometry-bound: Contrarian, Mystic, Betrayer |
| Historian | (11, inner) | geometry-bound: Strategist, Economist |
| Cartographer | (2, inner) | geometry-bound: Physician |
| Elder | (11, inner) | geometry-bound: Strategist, Economist |
| Contrarian | (7, inner) | geometry-bound: Child |
| Mystic | (7, inner) | geometry-bound: Child |
| Betrayer | (7, inner) | geometry-bound: Child |

10 of 12 agents are geometry-bound; 2 (Architect, Witness) are
vector-isolated and degrade to the full allowlist with explicit
notation. The vector-isolation is *itself* a structural finding —
those archetypal positions have no inner-face peer in the introspective
set, so refusal narrowing would force invented names. The fallback is
documented and testable.

**Out-of-scope (queue):** the agency surface (`AGENCY_AGENTS` in main,
`sandbox/lib/agents/`) does not yet go through `buildBoundedSystemPrompt`
under c-hard-iii. Refactor scheduled per (γ) — next-week milestone.

---

### Claim 2 — Correction Stream as First-Class Substrate (PPA #5)

A multi-agent reading-correction system in which user corrections are
recorded as immutable, typed events alongside the original agent
reading; the correction taxonomy is a closed enum that bumps the
schema version when extended; agents NEVER read prior corrections, so
the agents do not converge — only the record does.

**Why novel.** The dominant pattern is "agents that learn from
feedback" — RLHF, fine-tuning, in-context updates. Liminal's agents
remain bounded; the *record* compounds. The user's correction
disagreements are the moat, not the model's adaptations. Counter-
cyclical: better foundation models produce sharper agent reads, which
produce more interesting disagreements, which compound the record.

**Where enforced in code.**

| Element | File | Lines |
|---|---|---|
| Frozen 9-tag taxonomy | `lib/correction-tags.js` | 1-23 |
| Tag validator | `lib/correction-tags.js` | 25 |
| Correction storage shape | `lib/vault/db.js` | 49-58 |
| Correction write path (only) | `skills/check/store-correction.js` | full file |
| JSON Schema for correction event | `schemas/correction.v1.json` | full file |
| Disagreement-preservation invariant | docs in `lib/agents/index.js` | 41-43 (CLAUDE.md echo) |

**Frozen taxonomies that bound the claim.**
- 9 correction tags — `lib/correction-tags.js:1-11`
- 4 canonical vault tables — `lib/vault/db.js:11-75`
- `schema_version` field on every row — `lib/vault/db.js` (every `CREATE TABLE`)

**Future extension** (phase1 branch): `lib/vault/events.js` makes
correction-stream events first-class typed records with closed
enums for `EVENT_SOURCES`, `EVENT_SCOPES`, `EVENT_DELTA_TYPES`,
`EVENT_PRIVACY_TIERS`. Per `~/liminal/founder-brain/liminal-ip/03-architecture/PRODUCT_DATA_MODEL.md`
v0.1: append-only event log is the only place data is written;
everything else is derived.

---

### Claim 3 — Snapshot-Set Hash Cache (composition layer)

A multi-snapshot agentic reading service that caches inference results
by the cryptographic hash of the sorted snapshot UUID set + model id;
returns cached reads in O(milliseconds) when the vault state is
unchanged; invalidates structurally on any vault mutation; permits
identical reads for identical inputs across machines and time.

**Why novel.** The dominant pattern is task-keyed or query-keyed
caching. Liminal's cache key is the *vault state itself* — the
same vault yields the same agent reading (modulo model + agent set)
until the vault mutates. This is the substrate-level cache, not a
request-level cache.

**Where enforced in code.**

| Element | File | Lines |
|---|---|---|
| Hash construction (sha256 of sorted ids, truncated to 24 chars) | `sandbox/lib/orchestrator.js` | 6-12 |
| Cache lookup (hash, model) compound key | `sandbox/lib/orchestrator.js` | 60-69, 109-117 |
| Cache write on full reading | `sandbox/lib/orchestrator.js` | 154-186 |
| Cached reading inflation (rebuild from snapshot ids) | `sandbox/lib/orchestrator.js` | 32-58 |

**Performance claim.** First read: 60-90s (12 agent inferences). Cached
re-read on identical vault state: ~0.12s (~500-750× speedup on the warm
path). Empirical, sandbox surface only on `main` today; merges to the
introspective substrate when the sandbox→main consolidation completes.

---

## Vault crypto — defensible-by-construction

Not a patent claim, but a defensibility surface that matters for
investors and IP counsel. The vault is encrypted at rest with
SQLCipher v4 profile, and the profile is *asserted at runtime*
after every vault open — a future driver upgrade cannot silently
regress the cipher choice.

| Element | File | Lines |
|---|---|---|
| Profile assertion (regression guard) | `lib/vault/crypto.js` | 13-22, 50-59 |
| Cipher pragma application + key zeroize | `lib/vault/db.js` | 84-91 |
| Three key-release modes (env / SEP / Keychain) | `lib/vault/keyguard.js` | 17-94 |
| Plaintext legacy migration with secure-erase | `lib/vault/db.js` | 108-167 |
| SSRF guard (URL pre-fetch chokepoint) | `skills/agency/run.js` | 46-127 |

**Security parameters.** AES-256-CBC, 4096-byte pages, HMAC-SHA512
page authentication, PBKDF2-HMAC-SHA512 with 256k iterations,
32-byte vault keys generated via `crypto.randomBytes`.

---

## Five-minute tour (commands)

### 1. The frozen taxonomies (15 seconds)

```bash
cat lib/correction-tags.js | sed -n '1,23p'
cat schemas/*.json | jq -s '.[] | {name: .title, schema_version}'
```

You see: 9 correction tags, 4 JSON schemas, every one `schema_version: 1`.

### 2. The bounded refusal architecture (90 seconds)

```bash
cat lib/agents/bounded-system-prompt.js
cat lib/agents/validation.js
sed -n '54,67p' lib/agents/index.js
```

You see: prompt composer, runtime classifier, the canonical 12-agent
order. Allowlist is auto-generated; every agent's allowlist is every
*other* agent. Refusals are a structural prefix-check.

### 3. The agent disagreement (90 seconds — requires API key)

```bash
node skills/check/orchestrator.js '{"q1":"A","q2":"A","q3":"A"}' "test context"
sqlite3 ~/Library/Application\ Support/Liminal/vault.db \
  "SELECT agent_name, register, substr(interpretation, 1, 80) FROM agent_views ORDER BY agent_name LIMIT 12"
```

You see: 12 agents read the same state, produce 12 different
interpretations, no agent's reading is shaped by any other's. Run
the same command twice; the readings differ — that's the point.

### 4. The crypto regression guard (30 seconds)

```bash
node --test test/vault-crypto.test.js
```

You see: SQLCipher v4 profile asserted after vault open, malformed
keys rejected, plaintext-vault migration writes encrypted-only and
secure-erases the source.

### 5. The patent-claim anti-regression suite (15 seconds)

```bash
node --test test/patent-claims.test.js
```

You see: tests that fail when frozen taxonomies change without a
schema_version bump, when an agent module imports from corrections,
when bypass paths around the SSRF chokepoint appear.

(This file lands in commit alongside this PATENT_CLAIMS.md.)

---

## What does NOT count as a defensible claim

For the avoidance of doubt — these are not novel and would not survive
prior art scrutiny:

- **Multi-agent orchestration** in general (CrewAI, LangGraph,
  AutoGen, Swarm).
- **System-prompt domain specification** (every prompted agent does
  this).
- **Function-call refusal** as raised by the OpenAI tool-call format
  ("the model declined to call a function").
- **Embedding-based retrieval** over user data.
- **Encrypted local storage** of user data.
- **Better-than-cloud privacy** as a principle.

The novel claims are *structural*: bounded refusal as a designed
output (PPA #4), correction stream as immutable substrate (PPA #5),
and snapshot-set-hash as the cache key. Each is enforced at a single
chokepoint in code. Each has frozen taxonomies that bump
`schema_version` when extended.

---

## References

- `ARCHITECTURE.md` — three-layer composition surface (demo / backend / registry)
- `SECURITY.md` — vault threat model
- `SPEC.md` — operating spec for the hackathon submission
- `~/liminal/founder-brain/liminal-ip/02-models/two-faced-archetype-system.md` — archetypal geometry that future-grounds the bounded-refusal allowlist
- `~/liminal/founder-brain/liminal-ip/03-architecture/PRODUCT_DATA_MODEL.md` — event-log substrate canon (Phase 1 → Phase 5)
- `~/liminal/founder-brain/CLAUDE.md` — core learnings naming PPA #4, PPA #5
