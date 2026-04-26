# Architecture — layers of the onion

This document names how the three open work streams compose. Not a refactor plan; a synthesis surface. Tonight ships the outermost layer (PR #7). The middle and core land post-hackathon, designed to converge.

---

## The layers

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1 — Demo surface (agency profile, 3 agents)          │
│  PR #7 · ships AgentHansa hackathon submission Apr 25       │
│  The agents the user sees, the TUI they look at,            │
│  the register the pitch is in.                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  LAYER 2 — Backend service + cache                          │
│  PR #10 · merges post-hackathon as parallel artifact         │
│  HTTP API the TUI consumes, snapshot-set hash cache,         │
│  real-source ingest verified live.                          │
│  Turns the 30s deliberation into a 0.12s cached re-read.    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  LAYER 3 — Agent registry + archetypal core                 │
│  PR #11 · merges post-hackathon as data-not-schema upgrade  │
│  12 agents across 4 registers. Single source of truth.      │
│  Schema normalized to agent_views(deliberation, name, view) │
│  so agent count becomes data, not table columns.            │
└─────────────────────────────────────────────────────────────┘
```

Each layer is shipping independently. Each layer composes with the layers above and below.

---

## Layer 1 — Demo surface (PR #7, ships tonight)

**What's in this layer:**
- `lib/agents/{analyst,sdr,auditor}.js` — three bounded agents in the agency-replacement register
- `bin/liminal-tui.js` — Ink TUI rendering three panes with refusal beats
- `skills/agency/run.js` — orchestrator with URL pre-fetch + SSRF guards
- `scripts/seed-demo.js` + `scripts/demo.sh` — privacy-safe synthetic vault
- `SPEC.md` v0.6, `DEMO.md`, `README.md` — submission framing

**The pitch this layer carries:**
> "Founders pay agencies $500/month for diligence prep, cold outreach, ship reviews. Most AI agents hallucinate when out of depth. Liminal Agents are bounded — each refuses work outside its lane and names the correct agent."

**Why three agents (Analyst / SDR / Auditor):**
- Maps to AgentHansa hackathon brief (B2B agency replacement)
- Cleanly demonstrates PPA #4 (refusal-as-feature) in 60 seconds
- Names judges recognize at $500/mo price point
- The right *demo register* for this hackathon's audience

**This layer is the surface. The user types a task; three agents respond; one is in lane.**

---

## Layer 2 — Backend service + cache (PR #10, post-hackathon)

**What's in this layer:**
- `sandbox/bin/server.js` — Hono HTTP server on `localhost:3000`
- `sandbox/lib/orchestrator.js` — `runReading()` with sha256 snapshot-set hash cache
- `sandbox/lib/synthesis.js` — Opus compresses N snapshots → 1 paragraph + ≤3 threads before agents read
- `sandbox/lib/sources/{granola,claude-code}.js` — real-source ingest (35 Granola titles + 10-13 Claude sessions over 30 days verified live)
- `sandbox/API.md` — RESTful endpoint reference

**The performance claim this layer carries:**
> "First read: 64s. Cached re-read on the same vault state: 0.12s. ~500× speedup on the warm path."

**Why a separate backend:**
- Decouples the TUI from the inference path
- The cache key is the snapshot set itself (not the task) — same vault, same agents, same answer (until corrected)
- HTTP surface lets the TUI become any client — terminal, web, desktop
- Real-source ingest verified at scale before tonight's demo, so the demo synthesis runs against authentic signal density, not seed data

**This layer is the engine. It turns inference into a hot-path-cached service.**

---

## Layer 3 — Agent registry + archetypal core (PR #11, post-hackathon)

**What's in this layer:**
- `skills/check/agents.js` — single-source-of-truth registry: `{name, register, domain, anti-domain, system, task}` for all agents
- Normalized schema: `agent_views(deliberation_id, agent_name, interpretation)` replaces hardcoded `architect_view` / `witness_view` / `contrarian_view` columns
- Migration that preserves legacy data while flipping the storage shape
- 12 agents across 4 archetypal registers:

```
Structural:  Architect      Strategist     Economist
Somatic:     Witness        Physician      Child
Temporal:    Historian      Cartographer   Elder
Symbolic:    Contrarian     Mystic         Betrayer
```

**The architectural claim this layer carries:**
> "Agent count is data, not schema. Adding the 13th agent is a registry edit, not a migration."

**Why 12 agents in 4 registers:**
- The original Jungian frame — Architect, Witness, Contrarian — was always meant to expand
- Four registers (Structural / Somatic / Temporal / Symbolic) are the load-bearing axes for full identity reads
- Desktop MVP register, not hackathon register — the agency-replacement pitch uses 3, the personalized epistemic agent uses 12
- This is *what gets reused in WBS 1.7* per HACKATHON_MVP_RELATIONSHIP.md

**This layer is the substrate. It defines what an agent is and how the system holds many of them.**

---

## How the layers compose

The three layers are not parallel implementations of the same product. They are **profiles + services + substrate** of one architecture.

### Composition pattern (post-hackathon merge target)

```js
// skills/check/agents.js (Layer 3 — the registry)
export const AGENT_REGISTRY = {
  Architect:    { register: "Structural", domain: "...", anti: "..." },
  Strategist:   { register: "Structural", domain: "...", anti: "..." },
  Economist:    { register: "Structural", domain: "...", anti: "..." },
  Witness:      { register: "Somatic",    domain: "...", anti: "..." },
  Physician:    { register: "Somatic",    domain: "...", anti: "..." },
  Child:        { register: "Somatic",    domain: "...", anti: "..." },
  Historian:    { register: "Temporal",   domain: "...", anti: "..." },
  Cartographer: { register: "Temporal",   domain: "...", anti: "..." },
  Elder:        { register: "Temporal",   domain: "...", anti: "..." },
  Contrarian:   { register: "Symbolic",   domain: "...", anti: "..." },
  Mystic:       { register: "Symbolic",   domain: "...", anti: "..." },
  Betrayer:     { register: "Symbolic",   domain: "...", anti: "..." },
  Analyst:      { register: "Operational", domain: "...", anti: "..." },
  SDR:          { register: "Operational", domain: "...", anti: "..." },
  Auditor:      { register: "Operational", domain: "...", anti: "..." },
};

export const PROFILES = {
  agency:        ["Analyst", "SDR", "Auditor"],
  deliberation:  ["Architect", "Strategist", "Economist",
                  "Witness", "Physician", "Child",
                  "Historian", "Cartographer", "Elder",
                  "Contrarian", "Mystic", "Betrayer"],
  triad:         ["Architect", "Witness", "Contrarian"],  // PR #4 era
};
```

**Selecting a profile selects a layer-1 register without rewriting layer-2 or layer-3.**

- **Hackathon submission tonight:** profile = `"agency"`, demo runs Analyst / SDR / Auditor.
- **Desktop MVP launch:** profile = `"deliberation"`, the personalized epistemic agent runs all twelve.
- **PPA #4 evidence:** profile = `"triad"`, the original Jungian frame for patent claim continuity.

The TUI (Layer 1) reads the profile. The HTTP backend (Layer 2) caches per-profile. The registry (Layer 3) holds the canonical definitions. **One codebase, multiple shipping registers.**

### Schema composition

The current `deliberations` table has hardcoded columns:
```sql
architect_view TEXT, witness_view TEXT, contrarian_view TEXT
```

PR #11 normalizes this:
```sql
CREATE TABLE agent_views (
  deliberation_id TEXT REFERENCES deliberations(id),
  agent_name TEXT NOT NULL,
  interpretation TEXT,
  PRIMARY KEY (deliberation_id, agent_name)
);
```

PR #10's sandbox uses this same shape (in its `readings` table). PR #7's hackathon submission uses the legacy columns via the back-compat aliases in `lib/agents/index.js` (`Analyst → architect_view`, etc.).

**Migration path:** when PR #11 lands, the legacy columns become a view over `agent_views` for one release, then drop. Existing rows preserved.

### Cache composition

Layer 2's cache is keyed on `snapshot_ids_hash` — the sha256 of the sorted UUIDs of the input snapshots. **This is layer-1- and layer-3-agnostic** — it caches the agents-against-vault function regardless of which agents are in the profile.

Switching profiles invalidates the cache key (different agents = different reading), but the same profile against the same snapshot set returns instantly. **The 0.12s cached read works for the agency profile and the deliberation profile.**

---

## What ships when

| Layer | PR | Status | Ships |
|---|---|---|---|
| 1 — Demo surface | #7 | open, ready | **Tonight (Apr 25 8 PM PT)** |
| 1 — SSRF hardening | #9 | open, stacked on #7 | Tonight or post-merge |
| 2 — Backend service + cache | #10 | mergeable | Post-hackathon (Sun-Mon) |
| 3 — Agent registry (12 agents) | #11 | conflicting | Post-hackathon (after #7 lands) |
| Synthesis (this doc) | #7 | landing now | **Tonight** |

**Submission tonight is Layer 1.** The other layers exist in the repo as visible parallel work — judges who clone and look around see a structured roadmap, not a single-feature submission. That's the point of the synthesis surface.

---

## What this doc is not

- Not a refactor plan. The composition pattern above is a target, not a checklist.
- Not a binding contract. PR #11's exact register names + 12 agents are subject to evolution as the desktop MVP designs come online.
- Not the SPEC. SPEC.md is the operating-spec for the hackathon submission. ARCHITECTURE.md is the synthesis layer over the open PR set — what's true now, what's true post-merge.

---

## References

- `SPEC.md` — operating spec for tonight's submission (Layer 1)
- `SECURITY.md` — vault threat model (cross-cutting)
- `DEMO.md` — recording script + voice-over (Layer 1)
- `~/liminal/founder-brain/liminal-ip/HACKATHON_MVP_RELATIONSHIP.md` — convergence with desktop MVP (post all 3 layers)
- `~/liminal/founder-brain/liminal-ip/INVENTIONS.md` — PPA #4 (refusal) + PPA #5 (correction stream) — bind across all layers
- PR #7 (Layer 1), PR #10 (Layer 2), PR #11 (Layer 3) — the three open work streams this doc synthesizes
