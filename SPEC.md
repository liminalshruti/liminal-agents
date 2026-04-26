# Liminal Agents — hackathon submission spec (v0.6)

**Date:** Apr 25, 2026 · **Submission deadline:** **Sat Apr 25, 8:00 PM PT** (Topify AI / AgentHansa AI Agent Economy Hackathon — confirmed via Luma blast)
**Authors:** Shruti (orchestrator + correction loop), Shayaun (daemon + vault)
**Hackathon:** AI Agent Economy Hackathon · 577 2nd St SF · 4–9 PM PT Sat Apr 25
**Judges:** Alex Newman (claude-mem, 60K stars), Artin Bogdanov (SUN, a16z Speedrun SR006), Nishkarsh Srivastava (HydraDB), Gary Qi (ByteDance Trae)
**Prize:** 1st: $800 + $3K API credits + AgentHansa homepage feature 30d

The medium-level spec for the Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon entry. Reflects:
- Apr 21 strategic frame (3+1 daemon-driven, Granola/Obsidian/Reminders/Claude memory sources)
- Apr 24 daily's architecture evolution
- Apr 24 evening synthesis on voice + IP positioning
- Substrate shipped in PR #4 + Granola/CLI shipped in PR #5
- **Apr 25 22:14 strategic reframe — pitch, demo flow, and agent personas pivoted to founder-agency-replacement (this version)**

---

## 0. How to read this doc

**Live thinking beats recent docs beats older docs.** If a later transcript or live decision conflicts with what is written here, the live decision wins. The canonical files in `~/liminal/founder-brain/liminal-ip/` (THESIS.md, HACKATHON_MVP_RELATIONSHIP.md, INVENTIONS.md) capture *load-bearing constraints* that are stable: PPA claims, brand sentence, banned words, bio hard stops. Those bind. **Strategic decisions** — agent names, voice register, scope — evolve as the conversation moves; this spec records the latest evolution but does not freeze it.

**The Apr 25 22:14 meeting ("Liminal hackathon strategy and bounded agents product demo planning") is the most-recent-thinking source.** It supersedes earlier framings of the demo flow and pitch where they conflict.

### 0.1 Canonical references (founder-brain)

These files in `~/liminal/founder-brain/` bind decisions in this spec. Read them when SPEC text is ambiguous:

- `liminal-ip/THESIS.md` — Mirror not Companion, correction loop non-convergence, three load-bearing claims
- `liminal-ip/HACKATHON_MVP_RELATIONSHIP.md` — hackathon + desktop MVP as two vehicles, prompt reuse in WBS 1.7
- `liminal-ip/06-evidence/INVENTIONS.md` — PPA #4 (Bounded Refusal) + PPA #5 (Correction Stream) constraints
- `decisions/2026-04-21-agents-as-worker-personas.md` — surface vocabulary shift (Jungian → worker personas)
- `decisions/2026-04-21-hackathon-demo-data-sources.md` — 4 sources locked
- `product/2026-04-21_shayaun-architecture-proposal.md` — daemon + URL scheme + 3-PR scope
- `product/desktop-mvp/WBS.md` — section 1.7 reuses hackathon prompts (May 6+)
- `liminal-creative/CLAUDE.md` — voice rules, banned vocabulary, expressiveness gates

---

## 1. What this is, in three registers

**The hackathon submission.** A Claude Code plugin that runs a local always-on daemon, ingests signals from the user's existing tools (Granola, Claude Code, git), runs bounded multi-agent deliberation on those signals via Opus 4.7, and stores both the agents' reads and the user's corrections to a SQLCipher-encrypted local vault. Demo target: 60-second video, MIT-licensed code on GitHub. **Submission deadline: Sat Apr 25 8:00 PM PT** (per Apr 25 22:14 meeting; supersedes earlier "Apr 27 Sun" framing).

**The IP credibility play.** Inspectable evidence anchor for two pending PPAs: **PPA #4 (Bounded Agent Refusal Architecture)** and **PPA #5 (Correction Stream)**. Public timestamp, public license, working code. Patent counsel and investors can read the implementation; the architecture is not hand-waved. Convergent with the desktop MVP (`liminal-desktop`, May 12 ship): same prompts, same schema lessons, designed to merge. *Note: per Apr 17 22:21 sync, Shayaun has been independently briefed on PPA #4/#5 and is reviewing them for content + technical-benchmarking improvements; his code reflects patent-claim awareness, not just feature delivery.*

**The substrate for the personalized epistemic agent (Apr 14 product vision).** Liminal is, at the desktop layer, *a personalized epistemic agent that ingests the user's full intellectual biography — formal education, research history, professional experience, creative/embodied practices, stated curiosities, life context — and synthesizes it into a living model of expertise*. The agent reasons like the user at their best: it remembers everything so the user does not have to, surfacing connections contextually while they work. **Bounded refusal and the correction stream are the substrates that make this trustworthy** — without refusal the agent overreaches and hallucinates outside its competence; without correction the model of the user drifts from the user's actual experience. The hackathon ships the substrates; the desktop MVP ships the agent that uses them.

All three registers ship the same artifact. Decisions this week serve all three — when they conflict, the IP and forward-compat constraints win because the hackathon submission is replaceable and the patent timestamp is not.

---

## 2. Architecture (3 + 1, daemon-driven)

```
  Granola · Claude Code · git · (Obsidian) · (Apple Reminders)
                          │
                          ▼
                ┌──────────────────┐
                │     daemon       │   liminal-substrated
                │   always-on      │   polls every 5 min
                └────────┬─────────┘    writes signal_events
                         │
                         ▼
              ┌──────────────────────┐
              │   +1 Orchestrator    │   always-on routing layer
              │  thread + trigger    │   Haiku synthesis (cheap, every tick)
              │  + day synthesis     │   Opus synthesis (expensive, on trigger)
              └────────┬─────────────┘
                       │ on trigger
                       ▼
        ┌──────────────┬──────────────┬──────────────┐
        │  Architect   │   Witness    │  Auditor  │  Opus 4.7, parallel,
        │  structure   │  somatic     │  inversion   │  bounded, do not see
        │              │              │              │  prior corrections
        └──────────────┴──────────────┴──────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────┐
        │  vault (SQLCipher v4)                       │
        │  signal_events · deliberations              │
        │  surfacing_events · corrections             │
        └─────────────────┬───────────────────────────┘
                          │
                          ▼
           ┌──────────────┬──────────────┐
           macOS notify   /close skill   /history skill
           osascript      Claude Code    Claude Code
```

**Why 3+1.** Three peers disagreeing leaves the user with three messages and no place to put them. A +1 above the three turns the user-facing surface into one synthesized read with three traceable specialist readings underneath. The user corrects either the synthesis or a specialist directly — two distinct learning signals — without the overhead of triaging three parallel notifications.

**Why always-on.** The daemon and the +1 must run continuously so that ingest is silent and surfacing is bounded by the +1's routing logic, not by user prompting. The three specialists are invoked on demand when the +1 triggers a deliberation. This matches the OpenClaw pattern Shruti referenced and keeps inference cost bounded.

---

## 3. The +1 (orchestrator)

The +1 is not one file. It is the daemon's synthesis layer plus the trigger logic plus the close orchestrator — three components that together act as the always-on routing agent above the three specialists.

| Component | File | Model | Cadence |
|---|---|---|---|
| Thread detection | `lib/daemon/thread-detect.js` | Haiku 4.5 | every tick (5 min) |
| Trigger evaluation | `lib/daemon/triggers.js` | rules only | every tick |
| Day synthesis + agent invocation | `skills/close/close.js` | Opus 4.7 | on trigger only |

**The four routing decisions the +1 owns:**

1. **Worth surfacing at all?** Default is silence. Most ticks produce no surface. `triggers.js` `MIN_DAILY_SIGNALS` gate plus `already_surfaced_today` dedup are the current implementation.
2. **Surface now or buffer?** Currently one cadence (evening close at 18:30 local). More triggers (`open-loop`, `stuck`, `cross-register-conflict`, `focus-mode`) are stubbed and out of scope this week.
3. **What shape?** Currently one shape: macOS notification → `liminal://` URL → `/close` skill in Claude Code. Sidecar (in-artifact) and action-proposal (write-back) shapes are post-hackathon.
4. **Read-only or write-back?** Read-only this week. Gmail/GCal write-back via existing MCP plugins is the post-hackathon Speedrun-pitch story.

The +1's existence is the difference between three parallel agents and bounded deliberation.

---

## 4. Sources

| Source | Status | Demo? | Notes |
|---|---|---|---|
| `claude-code` | ✅ real ingest | yes | reads `~/.claude/projects/**/*.jsonl` |
| `git` | ✅ real ingest | yes | reads commits via `git log` |
| `granola` | stub → **Sat impl** | yes | de-risked — see §4.1 |
| `obsidian` | stub | nice-to-have Sat | file-watch a vault path |
| `apple_reminders` | not in source enum | maybe Sat | EventKit via Swift bridge — non-trivial |
| `calendar` | stub | post-hackathon | EventKit; complex |
| `knowledgeC`, `imessage` | stub | out of scope | TCC restrictions |

**Demo target:** Granola + claude-code + git. Three sources, Granola is the Apr 21 "everyone has it" prove-the-story source.

**No Gmail or Calendar ingestion this week.** Those are write-back surfaces post-hackathon.

### 4.1 Granola ingest — investigation result (Apr 24, 20-min Shruti probe)

**Path:** `~/Library/Application Support/Granola/cache-v6.json`
**Format:** Plain UTF-8 JSON, ~10 MB on a working Mac, no encryption (the `*.enc` files are unrelated state).

**Structure:**
```js
data.cache.state.documents = {
  "<uuid>": {
    id, title,                   // e.g. "Shruti x Shayaun Daily"
    created_at, updated_at,      // ISO-8601
    notes_plain, notes_markdown, // meeting body
    summary,                     // sometimes present
    valid_meeting,               // bool — filter on this
    people, chapters,
    google_calendar_event,       // for cross-ref later
    deleted_at,
    ...
  }
}
```

44 docs on Shruti's machine; 7 with non-empty `notes_plain` from the last week. Filter: `valid_meeting === true && notes_plain.length > 0 && !deleted_at`.

**Recommended ingest pattern (mirror `lib/sources/claude-code.js`):**
1. Cursor on `last_ingest_at` (ms). `fs.statSync(cache).mtimeMs` gate before parse — only parse if cache changed since cursor.
2. Read cache, parse JSON, walk `documents`.
3. For each doc passing filter, skip if `Date.parse(updated_at) < cursor`.
4. Insert one `signal_event` per doc: `source='granola'`, `kind='meeting_notes'`, `register='operational'`, `content={title, updated_at, notes_plain (truncated to 4KB), people, doc_id}`.
5. Update cursor.

**Cost:** ~50 lines, no new deps. Shayaun ships Saturday morning; Shruti's probe (this section) is the input — he doesn't need to do the discovery.

**Side note (out of scope):** `data.cache.state.transcripts` is a separate dict (7 entries on Shruti's machine) holding raw transcript text. Don't pull it in unless `notes_plain` proves insufficient for the demo.

### 4.2 Source filtering and consent

**Granola contains commingled personal and operational content.** Audit of Shruti's own `cache-v6.json` (Apr 24) found her recent meetings include not just operational content (Speedrun cafe prep, hackathon dailies, investor strategy) but also personal/relational content (marriage repair conversations, financial-stress dialogues, tax planning with sensitive personal context). A naive "ingest all meetings" daemon would pull all of it into the vault commingled with work signals.

This has three implications for the spec:

1. **Hackathon demo uses pre-seeded synthetic transcripts only.** Production Granola contents are out of scope for the live demo recording (Apr 26 Sat). The demo seed script (Shruti's owns, §8) writes a curated, non-personal transcript set to a fresh vault before recording begins. Do not record against a developer's real Granola cache.

2. **Production filter design is post-hackathon.** Real users will face the same commingling. Three viable patterns: (a) per-meeting opt-in via a Granola tag the user adds, (b) per-source enable/disable in `integrations.json` with sane defaults that exclude personal-attendee meetings, (c) attendee-based filter (only ingest meetings whose attendees match a user-defined work allowlist). All defer to post-hackathon, but the constraint exists from day one — note in README that production filtering is in design.

3. **Vault-as-Switzerland-safe (Apr 24 Shruti analogy) defends the substrate, not the ingest.** The encryption-at-rest model protects vault contents from theft. It does not protect against the daemon making a bad ingest decision and pulling in content the user didn't intend to share with the system. Filter-at-ingest is a separate trust layer the spec acknowledges but does not deliver this week.

This section exists so future-Shayaun and future-Shruti remember the constraint when the daemon goes live for real users.

---

## 5. Agent voice (Apr 21 + Apr 24 + Apr 25 22:14 synthesis)

The current system prompts use therapist-coded phrasing ("what is being held," "felt experience," "embodied signal"). Apr 21 rejected this register: *"they need to sound like co-workers... archetypically they are different types of worker personas."*

**Apr 25 22:14 update — agency-replacement register.** The hackathon pitch reframed today: *"Founders pay agencies $10k/month for diligence prep, competitive teardowns, brand audits. Most AI agents hallucinate when out of depth. Liminal's three bounded agents each refuse work outside their lane."* This pulls the voice from generic-co-worker toward **specialist contractor** — the agent voice is *the consultant who wrote the deck and won't bullshit you about a domain they don't own*. Refusal becomes the demo, not a side beat.

**The synthesis.** Apr 21 "co-worker" + Apr 25 "specialist contractor" + canonical "Mirror not Companion" + PPA #4 "refusal as credibility" compose into one register: **direct, specialist, refusing, no chummy register.** A chief of staff with a domain, not a coach. The agent disagrees the way a competent senior peer disagrees — flat, evidence-based, no softening — and *refuses out-of-domain work by name* ("that's the Analyst's lane, not mine").

**Mirror constraint (test for every voice rewrite):** *would this language make the user push back more, or accept more?* If it pulls for acceptance, it is wrong.

**Concrete rewrite — `lib/agents/*.js`:**

| Agent | Direct-archetype rewrite |
|---|---|
| Architect | "You are the Architect. You name the structural pattern producing this state and what would change it. State the pattern as fact. No 'I sense', no 'it seems', no hedging. 1–2 sentences. If asked about felt experience, refuse and name the boundary." |
| Witness | "You are the Witness. You name the body-level signal under the words — what is being held, what is being defended against. State it as observation, not interpretation. No 'sounds like', no soft openings. 1–2 sentences. Refuse to strategize. If asked for a plan, name the boundary." |
| Auditor | "You are the Auditor. You say what the other two will not. Invert the obvious read. State the dangerous question as a statement, not a question. 1–2 sentences. Refuse the comfortable framing. No 'have you considered'." |

The "If asked about X, refuse and name the boundary" clauses **operationalize PPA #4 at runtime.** Currently agents *describe* their anti-domain in the system prompt but do not actively refuse when prompted into it. Friday's voice rewrite makes refusal a witnessable output. This matters for the patent claim and for the demo.

### 5.0 Open question — register for README + voice-over (separate from system prompts)

The system-prompt rewrites above position the three agents as **other-than-the-user** (third-person frame: Architect, Witness, Auditor — three voices reading you).

The Mar 31 evoked UX (Shruti to Shayaun, describing Liminal in her own words) positions the product as **a private inner workspace where the user metabolizes the gap between input flux and creative output** — the agents as *modes of the user's own thinking made externalizable*, closer to IFS parts work than to workplace deliberation. *"It's like this inner workspace for your mind... an inner space to literally privately build together this idea of what [you are] creating."*

These can coexist. The system prompts can stay third-person archetypal (good for runtime behavior, good for PPA #4) while the **README and demo voice-over** lean toward "three readings of your day, made disagreeable by design, so you can correct them" rather than "three agents reading you."

**Decision needed (Friday):** which register does the demo voice-over and README copy use? Two live options:
- "Three agents read your day. They disagree. Your correction is the data." (current — workplace frame)
- "Three readings of your day, surfaced as disagreement so you can correct them." (Mar 31-aligned — interior frame)

This decision does not block voice rewrite of system prompts; both rewrites compose with either copy register.

### 5.1 Naming (decision: live, per Apr 25 hackathon brief reframe)

**Apr 25 16:30 hackathon-brief reframe.** The actual hackathon ("AI Agent Economy Hackathon" by Topify AI / AgentHansa) is sharper than the Apr 25 22:14 version. The prompt: *"What would a business pay an agency $500/month to do?"* Not $10k/month — $500. Judges are three memory-layer infra builders + one a16z Speedrun founder. Agents are graded on competing-on-real-B2B-tasks (lead gen, outreach, market research, competitive analysis, data enrichment, SEO audits).

The naming has to map to **specific B2B agency roles a founder recognizes at $500/month price point**, not McKinsey vocabulary.

**Decided lineup (Apr 25 PM):**
- **Analyst** — diligence, teardowns, market research, competitive analysis, data enrichment. The agent a founder would hire from a research firm. Replaces Architect.
- **SDR** — outreach, cold email drafting, follow-up scheduling, lead enrichment. The agent a founder would hire from a sales-dev agency. Replaces Witness.
- **Auditor** — refuses what's not ready, names what's missing, dissents on shipping decisions. The agent a founder would hire as a compliance-or-risk reviewer. Replaces Auditor.

**Why these names win:**
- **Judge-fit.** Three of four judges build memory infrastructure (Alex Newman / claude-mem, Nishkarsh / HydraDB, Artin / SUN-on-a16z-Speedrun). They evaluate based on real-task fit. *Analyst / SDR / Auditor* are roles every B2B founder pays for; the judges instantly recognize the price-point claim.
- **Demo voice-over.** Compresses to: *"An Analyst that does the research. An SDR that runs the outreach. An Auditor that refuses what's not ready. The vault remembers what you correct."*
- **Memory-layer hook.** Vault + correction stream IS a memory layer for these judges. Refusal is the credibility move; vault is the category-fit move.
- **Apr 14 vision compatibility.** Personalized epistemic agent at desktop scale = your Analyst, your SDR, your Auditor — trained on your intellectual biography, refusing in your voice.

**Cost of rename:** one column enum (`corrections.agent`), three field names in `deliberations` (`architect_view` → `analyst_view`, `witness_view` → `sdr_view`, `contrarian_view` → `auditor_view`), three `lib/agents/*.js` files (rename + system prompt rewrite), ~1 hr including a one-shot value-remap script for any existing rows with old enum values. Not a user-data migration.

**PPA #4 note.** The patent claim is *bounded refusal*, not the names. Analyst/SDR/Auditor have crisper anti-domains than Architect/Witness/Auditor — the agency-role framing actually *strengthens* the refusal claim.

**Forward-compat note.** Desktop MVP WBS 1.7 reuses these prompts starting May 6. The MVP adopts the rename.

**Open with Shayaun:** he just shipped a refusal test that uses Architect/Witness/Auditor names against his unpushed prompt rewrites. **Will reconcile when he's online** — his refusal-test logic transfers to new names; only the system-prompt strings change.

---

## 6. Persistence (shipped in PR #4)

Four tables, schema-validated by JSON Schema files, SQLCipher-encrypted at rest:

- **`signal_events`** — raw signals from sources. Append-only.
- **`deliberations`** — three-agent reads triggered by `check` or `close`.
- **`surfacing_events`** — daemon-initiated prompts to user.
- **`corrections`** — user pushback. **The product.**

**Integrity gaps found in audit (worth fixing before merge):**
- `corrections.deliberation_id` and `surfacing_events.deliberation_id` declare no `REFERENCES` → orphan rows possible
- No `CHECK` constraints on enum columns → JSON Schemas are documentation, not DB-enforcement
- No DB-level `PRAGMA user_version` → cannot tell schema generation by file inspection

~30 lines of SQL fixes all three. These are constraints on a fresh schema, not a data migration — schema-locked rule does not apply.

**Friday work:** correction-tag capture in `/close`. The 9-tag taxonomy is defined in `correction.v1.json` but the `/close` flow doesn't capture it. After the close render, prompt user for tag + reason, write the correction row. Without this, PPA #5 has no demonstrable taxonomy in the public code.

**Schema is locked otherwise.** Per CLAUDE.md, no user-data migrations mid-hackathon. The agent-rename exception (§5.1) is a one-shot value remap on a column with no user data of consequence yet.

---

## 7. Demo flow (60-second video, recording Sat 6-7 PM PT)

**Per Apr 25 22:14 reframe.** The demo is now agency-replacement, not coherence-check. Refusal is the central beat, not a side beat.

**One-minute pitch (voice-over opening):**
> "Founders pay agencies $10k a month for diligence prep, competitive teardowns, brand audits. Most AI agents hallucinate when out of depth. Liminal's three bounded agents each refuse work outside their lane."

**Demo flow (Ink TUI, run inside tmux):**

1. **Open shot.** tmux split: left pane shows the Liminal TUI header (vault path, three agents idle); right pane shows `tail -f daemon.log` running silently. *Establishes: local, no server, observable.*
2. **First request.** User asks the **Auditor** to do outreach to a potential investor. Auditor *refuses* and names the correct agent: *"That's the SDR's lane. I do dissent, not action."* TUI shows: Auditor status → REFUSED, with the refusal text in distinct color. *Demonstrates PPA #4 in 4 seconds.*
3. **Second request.** User asks the **Analyst** for a competitive teardown of a SaaS startup. Analyst produces a structured 3-paragraph teardown — actual content, not refusal. TUI shows Analyst → ACTIVE → COMPLETE, output panel renders the teardown. *Demonstrates output quality (30% of judging).*
4. **Third request.** User asks the **SDR** to draft an outreach email based on the Analyst's teardown. SDR produces a short cold email referencing the teardown's findings. *Demonstrates cross-agent context flow.*
5. **Vault visibility.** User runs `/history` (existing skill). TUI shows: 3 deliberations stored, 1 refusal logged, 0 corrections yet (judge can see the data category). *Demonstrates PPA #5 substrate.*
6. **Closing beat.** TUI clears to a single line: *"Three bounded agents. Persistent vault. Agency-priced work."*

**Voice-over arc:**
- (0:00) Pitch: agencies cost $10k/month, AI hallucinates, bounded agents refuse out of lane
- (0:10) Refusal beat: Auditor refuses outreach, names SDR
- (0:25) Output beat: Analyst produces teardown
- (0:40) Cross-agent beat: SDR drafts based on teardown
- (0:50) Vault beat: history view, "the record is the moat"
- (0:58) Tagline: "Bounded agents. Persistent vault. Agency-priced work."

**Critical: API mode required for recording.** CLI mode latency (30-90s per call) makes a 60-second video impossible. Set `ANTHROPIC_API_KEY` for the demo. CLI fallback is for the open-source-no-key story, not the recording.

**Pre-recording sanity checks:**
- [ ] Run end-to-end against the seed vault (synthetic transcripts only, never the real Granola cache — see SPEC §4.2)
- [ ] Verify each agent's refusal lands in <2 sentences, no hedges
- [ ] Verify Analyst teardown is structured (header + 2-3 sections), not a wall of text
- [ ] Confirm TUI renders cleanly in 1080p screen capture (no terminal cruft, no scrollback bleed)
- [ ] Check `daemon.log` tail doesn't surface anything personal — pre-clear it before recording

---

## 8. Saturday execution plan (revised — 22 hours to submission)

**Timeline reset.** Apr 25 22:14 confirmed submission deadline is **Sat Apr 25 8:00 PM PT**. Demo recording target: 6-7 PM PT. UI design collaboration before 6 PM. ~22 hours from now (this is 11 PM Fri local, hackathon ends Sat 9 PM).

**Friday morning — Shruti pre-merge checklist (~30 min):**
- [ ] Pull `allsmog-changes`, `npm install`, run each test file individually with `LIMINAL_VAULT_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`. Confirmed working as of Apr 24 audit: 20/20 tests pass per-file. (`node --test test/` folder-level errors at the dispatcher under Node 25 — runner quirk, not a code bug.)
- [ ] Confirm Granola stub is *still* a stub (no surprise late commit) before signaling Shayaun to build the real one.
- [ ] Decide naming question (§5.1) so Friday voice rewrite is unblocked.
- [ ] Optional: apply the integrity-constraints SQL patch (§6) before merge.

**Shayaun owns:**
- ✅ Vault, SQLCipher, daemon scaffold, claude-code + git ingest, thread-detect, evening-close trigger, osascript notify, `liminal://` URL handler — shipped in PR #4. Audit confirms tests pass.
- ❌ **Granola source ingest — Saturday.** De-risked path in §4.1. Mirror `claude-code.js`. ~50 lines.
- ❌ Verify `launchd` install end-to-end on a clean machine (test plan checkbox unchecked).
- ❌ Optional: `bin/liminal-keyguard` Swift binary for biometric unlock — defer post-hackathon, env-key path is sufficient for demo.

**Shruti owns:**
- ❌ Decide agent naming (§5.1) — blocks voice rewrite.
- ❌ Direct-archetype voice rewrite of three agent system prompts (§5).
- ❌ Correction tag capture in `/close` (§6).
- ❌ Demo seeding script: realistic Granola transcript + 5–10 signals to a fresh vault, reproducible demo state.
- ❌ 60-second video script (§7).
- ❌ README addition: one paragraph at top linking to desktop MVP + IP relationship. (Existing README on PR #4 is already aligned with the 3+1 framing; this is additive, not a rewrite.)

**Resolved:**
- ~~Granola ingest: file-watch vs. API?~~ Read `cache-v6.json` directly (§4.1).
- ~~Three-agent peer model vs. 3+1 daemon-driven?~~ 3+1, Apr 24 daily.
- ~~Forced-choice flow as input?~~ Repurposed as manual entry surface; daemon ingest is the primary path.
- ~~Submission Sun Apr 27?~~ Sat Apr 25 9 PM PT, per Apr 25 22:14.
- ~~Demo flow = coherence check + correction?~~ Agency-replacement (refuse outreach → produce teardown), per Apr 25 22:14.

---

## 8.1 Critical path table (≤22 hours to submission)

| When | Owner | Task | Blocks | Status |
|---|---|---|---|---|
| Now (Fri PM) | Shruti | Ping Shayaun: confirm `75b5b9f` push, align on agent rename Analyst/SDR/Auditor | rename + voice rewrite | OPEN |
| Now (Fri PM) | Shruti | Demo seed script — synthetic Granola/Obsidian/Reminders for agency-replacement demo | demo recording | IN PROGRESS |
| Sat AM | Shruti | Apply agent rename (lib/agents/*.js + correction.v1.json + deliberation columns) | demo, voice rewrite | OPEN |
| Sat AM | Shruti | Direct/specialist voice rewrite of 3 system prompts (Analyst/SDR/Auditor) | demo refusal beat | OPEN |
| Sat AM | Shayaun | Verify `launchd` clean install, optional integrity-constraints patch (§6) | merge to main | OPEN |
| Sat AM | Shayaun | Apply blocker #1 from PR #4 review (`git.js:20` --since fix) | demo first-run | OPEN |
| Sat midday | Shruti | Build Ink TUI (§12) — header, agent status panel, output panel, refusal styling | demo recording | OPEN |
| Sat midday | Shruti | New skill: `/diligence` or `/teardown` — wraps runAllAgents with the agency-replacement prompt template | demo | OPEN |
| Sat 4-5 PM | Shruti | End-to-end dry run against seed vault, verify all three demo beats | recording | OPEN |
| Sat 5-6 PM | Shruti | UI polish + tmux session prep + asciinema test recording | recording | OPEN |
| **Sat 6-7 PM** | **Shruti** | **Record 60-second demo video** | submission | OPEN |
| Sat 7-8 PM | Shruti | README addition (IP relationship + MVP forward link) + final repo cleanup | submission | OPEN |
| Sat 8-9 PM | Shruti | Submit to Cerebral Valley × Anthropic | — | OPEN |

**Critical-path dependencies (do not violate ordering):**
- Rename + voice rewrite → TUI styling (TUI references agent names visibly)
- Seed vault → end-to-end dry run (cannot test against real Granola for privacy)
- TUI complete → recording (TUI is the demo surface)
- Recording → submission

**Bail-out plan if TUI is over budget by Sat 4 PM:** ship raw stdout demo. Skip Ink. Lose visual polish but keep refusal/teardown content. Better a working demo of the substrate than a broken TUI.

---

## 9. Out of scope this week

- Gmail / Calendar ingestion or write-back (post-hackathon Speedrun pitch)
- Sidecar UI in artifacts (the Apr 24 "Gmail changelog" pattern)
- Daemon triggers beyond evening-close: `open-loop`, `stuck`, `cross-register-conflict`, `focus-mode` (stubbed in `triggers.js`)
- Biometric vault unlock via Secure Enclave (`bin/liminal-keyguard` not built; env-key path is sufficient for demo)
- Obsidian and Apple Reminders ingest (nice-to-have if Saturday allows)
- Agent learning from prior corrections — `deliberation.v1.json` line 5 explicitly forbids this, by design, per PPA #5

---

## 10. IP positioning

The hackathon ships under MIT with a public timestamp because it serves a second function beyond the Cerebral Valley submission: **inspectable evidence anchor for two pending PPAs.**

**PPA #4 — Bounded Agent Refusal Architecture.** Agents with explicit anti-domains that *actively refuse* out-of-domain prompts. Refusal is a designed output, not an error. The §5 voice rewrite is what makes this demonstrable in the public code — currently agents describe their anti-domain in the prompt but do not refuse when prompted into it. Friday's work closes this gap.

**PPA #5 — Correction Stream.** A first-party data category produced when users push back on AI reads. The vault's `corrections` table with its 9-tag taxonomy is the reference implementation. Critically: `deliberation.v1.json` line 5 declares *"Agents do not adapt to prior corrections. System prompts never reference user history."* This is not a bug — it is the patent claim. Agent statelessness is what keeps the correction loop from converging.

**Implication for what we ship.** Every demo beat that shows refusal (an agent declining out-of-domain) and every beat that shows non-convergence (corrections accumulating without changing the next agent read) strengthens the IP claim. Anything that softens refusal or smuggles correction-history into prompts weakens it.

**Implication for the README.** The PR #4 README is aligned. The one-paragraph addition should state plainly that the code is MIT-licensed, dated, and serves as inspectable evidence for the two PPAs — without overclaiming patent-pending status before filings.

---

## 11. Forward compatibility with the desktop MVP

This hackathon is not throwaway. Per `~/liminal/founder-brain/liminal-ip/HACKATHON_MVP_RELATIONSHIP.md`:

- **Agent prompts ship forward.** Desktop MVP WBS 1.7 (May 6+) reuses the system prompts written this week. If we rename or rewrite voice in the hackathon, the MVP adopts the same in WBS 1.7.
- **Vault schema is the prototype.** The four-table SQLCipher substrate validates the local-first SQLite decision empirically before the MVP commits to it. Schema lessons (FK constraints, CHECK enforcement, `user_version` versioning — see §6) feed the MVP event log design.
- **Plugin users get migration.** Anyone who runs the plugin gets a migration path to the desktop client when it ships. Avoid schema choices this week that cannot migrate forward.

**Decision principle for the rest of the week:** when in doubt, ship the version we want the MVP to inherit. Do not preserve hackathon-specific compromises that a forward-compat constraint would force us to reverse in two weeks.

---

## 12. Terminal UI (Ink + tmux) — added Apr 25 PM

**Scope addition.** The 60-second demo recording cannot show raw stdout — it has to show a *visible product surface*. The plan: build an **Ink** (React-for-terminal) TUI that renders the agent workflow, tested in **tmux** for isolation. Target ~2 hours of dev work.

**User:** developer / demo audience running the system locally or via CLI.

**Core requirements:**
- Structured, readable output from agent workflows (not raw logs)
- Visual hierarchy — distinguish agent roles (Analyst / SDR / Auditor), status updates, final outputs
- Multi-agent interaction display: workflows, deliberation, refusal beats
- Runs cleanly inside tmux sessions

**Nice-to-haves:**
- Color-coded output per agent
- Progress indicators for long-running calls (the demo will use API mode — fast — but CLI-mode users see the spinner)
- Interactive input prompts for user-in-the-loop moments (correction capture)

**Out of scope:**
- Web or desktop GUI (that's the desktop MVP, May 12)
- Persistent dashboard or logging UI (the daemon already writes to `daemon.log`; TUI is ephemeral)

**Success criteria:** someone runs `claude /diligence` (or whatever the new skill is named — TBD), and the terminal shows the three agents activating in parallel, one of them refusing the request and naming the correct agent, the others producing structured output. The refusal beat is visible without explanation.

**Components (per Apr 25 PM spec):**
- **Header** — system name, session info, vault path
- **Agent status panel** — which of Analyst / SDR / Auditor is active, what stage (idle / reading / refused / produced)
- **Output panel** — structured display of agent responses, refusal text in distinct color, output text in another
- **Input bar** (optional) — correction tag picker post-output

**Technical scaffolding:**
```bash
npm install ink ink-text-input
```
Mount in `bin/liminal-tui.js` (new file). Render() entry point. Wire to existing `lib/agents/index.js` `runAllAgents()` via async iterator or event emitter. tmux test session: `tmux new -s liminal-test` with split panes (TUI + tail of daemon log).

**Build plan (ordered for ~2hr completion):**
1. Init Ink project, basic render
2. Define layout (Header / Status / Output)
3. Wire to existing agent backend
4. Style with `<Box>` / `<Text>` / colors
5. tmux test session
6. Iterate against real refusal flow
7. Demo prep — capture clean recording (asciinema candidate)

**Constraint vs. existing skills.** The current `/check`, `/close`, `/history` skills (PR #4) print JSON to stdout. The Ink TUI is additive — wraps the same orchestrator calls in a TUI. Do not replace existing skills; the JSON-stdout interface is what makes the substrate inspectable to judges. **The TUI is the demo surface; the JSON skills are the IP-evidence surface.**

---

### 11.1 UX patterns captured for desktop MVP design (do not lose)

Patterns surfaced in conversation that are out of scope for the hackathon and the May MVP, but should not be lost. Capture here so they reach desktop-design conversations later:

- **Tray-based window interception (Apr 24 Shruti).** Liminal exposes a tray on the desktop. Other apps' windows can be dropped into the tray. When a window is in the tray, Liminal can observe and interact with it. *"It would be cool if it was like your warp tab was actually a little part of Liminal... or Liminal had a tray. Where you could drop a window and then if that window was in the tray, then Liminal could see it and interact with it."* Out of scope for hackathon and MVP; first-articulation captured here.
- **Sidecar-changelog pattern (Apr 24 Shruti).** Findings appear as a list next to the relevant artifact (e.g., "3 things noticed about this email" rendered as a sidebar inside Gmail). Read-only sidecar pattern, not action-proposal. The Apr 24 transcript articulates this as the antidote to notification clutter.
- **Visualization-as-output (Mar 31 Shruti).** *"Liminal takes all of that, which seems messy and completely unrelated, and builds together this knowledge graph of connections, and then basically, an artifact is created where it's like a visualized version of all of this. A picture is worth a thousand words."* The desktop MVP renders deliberations as visual artifacts, not text. This plugin renders the substrate the artifacts are generated from. Voice-over for the demo (§12) names this explicitly so the hackathon's text-mode demo does not narrow the product story.
- **Album-as-season-of-life metaphor (Mar 31 Shruti).** *"An album is usually some kind of reflection or some kind of artifact that is the product of a season of life for an artist."* Frames longitudinal vault contents as crystallizable into discrete artifacts (an "album" of corrections, a "chapter" of deliberations). Useful frame for desktop UX of vault retrieval.

---

## 12. The pitch (for README addition + Speedrun)

**Canonical 15-second pitch (from Apr 23 Speedrun Cafe cheat sheet):**

> Liminal. A local-first desktop vault where AI agents disagree, deliberate, and prompt you by design. For founders at agentic scale.

**Fallback (also Apr 23):**

> Granola captures meetings. Obsidian captures notes. Neither captures the person. I'm building the thing that does.

**Lead-with (only if they lean in):**

> Liminal gives form to inner life.

**What this hackathon ships, in one sentence:**

> A three-agent Claude Code plugin at the CV × Anthropic Built with Opus 4.7 hackathon. Co-founder ships the daemon, I ship the correction loop. Live by Apr 27.

**Why it matters:** Most AI products succeed when users accept the output. Liminal Agents succeeds when users push back. Better AI deepens the disagreement instead of eliminating it — the semantic delta between what the model sees and what the user experiences is the data category no one else owns. The vault holds it. The vault is local-first, encrypted at rest, and non-reproducible from any other source.

**For the Speedrun application:** the hackathon plugin is one of two shipping surfaces of the Liminal architecture. The other is the desktop MVP, building in parallel under a private codebase, demoing May 12. Both implement bounded refusal (PPA #4) and the correction stream (PPA #5). The plugin is the publishable edge; the desktop is the production substrate; both are designed to converge.

**Voice-over closing beat for the 60-second demo:**

> "In the desktop client shipping in May, these deliberations render as visual artifacts. This plugin is the substrate they are generated from."

This sentence costs nothing, prevents the hackathon's text-mode demo from narrowing the product story, and signals the visualization-as-output UX (Mar 31 evoked) is the intended desktop direction.
