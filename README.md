# Liminal Agents

```
                              ◇  ◆  ◇

      task ──► ┌────────────┬────────────┬────────────┬────────────┐
               │ DILIGENCE  │  OUTREACH  │  JUDGMENT  │ OPERATIONS │
               │ Analyst    │ SDR        │ Auditor    │ Operator   │
               │ Researcher │ Closer     │ Strategist │ Scheduler  │
               │ Forensic   │ Liaison    │ Skeptic    │ Bookkeeper │
               └────────────┴────────────┴────────────┴────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   vault (sqlite)    │
                          │   readings · views  │
                          │   corrections       │
                          └─────────────────────┘

           refusal is the feature.  the record is the moat.
```

> **Twelve bounded specialists in four registers. Each refuses out of lane and names the right agent. The vault keeps the record.**

A multi-agent system that does the work a small business pays an agency $10K/month for: diligence, outreach, judgment, and the steady-state operations that hold it together. Most AI agents hallucinate when out of depth. **Liminal Agents are bounded — each refuses work outside its lane and names the correct agent, by name.**

Built for [**OSS4AI Hackathon #32**](https://lu.ma/) (Apr 26, 2026), extending the Liminal Space architecture from the AgentHansa AI Agent Economy Hackathon (Apr 25, 2026 — judge feedback below directly informed this version).

## TL;DR

- **Twelve agents in four registers.** Each one does one thing. Refusal-as-output keeps them honest.
- **Real ingest, real disagreement.** Drop in 30 days of meeting notes / Claude Code sessions / commits — the vault populates, the agents disagree, and you correct what got you wrong.
- **Local-first vault.** SQLite + WAL. Every reading, every correction, never leaves the device.
- **Correction stream.** Pushback is first-party data. The vault grows with you; the agents do not.
- **HTTP API + Claude Code plugin.** Run the server (`npm start`), call `/api/read`, get 12 reads back. Or run the introspective `/check` skill via Claude Code.
- **`claude -p` OAuth or `ANTHROPIC_API_KEY` — auth auto-detected.**

## The five buyers

The AgentHansa judge said: *"Pick the first 5 buyers, ship one specific deliverable for them, and the architecture will sell itself."* This is that list, with the deliverable in each row.

| # | Buyer | Why they pay | Specific deliverable |
|---|---|---|---|
| **1** | **Solo founder mid-fundraise** | Diligence prep, competitor teardowns, investor-list research — currently $500-2K/week from a fractional ops person | `/api/read` over a vault of pitch-meeting transcripts → Analyst names what's known, Researcher names what's missing, Skeptic inverts the obvious read. 12 reads in ~100s. |
| **2** | **a16z Speedrun-style accelerator partner** | Triaging founder datarooms in 30 minutes — currently a 6-hour bottleneck on partner time | Drop a founder's dataroom (deck + memo + 3 meeting transcripts) → 12 register-grouped reads → exportable diligence memo. |
| **3** | **Pre-seed engineering team lead** | Ship/no-ship calls on PRs, contract reviews, customer-success escalations — currently 4 founders Slacking each other | `/api/read` over the week's Slack-and-email surface → Auditor's READY/NOT READY verdict + Strategist's 4-week consequence chain. |
| **4** | **Solo SaaS operator** | Cold outreach, follow-ups, scheduling, weekly relationship-warm — currently $800/month for a part-time SDR | SDR + Closer + Liaison + Scheduler chain. SDR drafts the open, Auditor reviews, Closer follows up, Liaison keeps warmth, Scheduler books. |
| **5** | **Compliance / audit lead at a regulated startup** | Audit-trail-grade evidence of every AI-assisted decision — currently a spreadsheet | Every reading has provenance: which signals fed it, what each of 12 agents said, what was corrected, by whom, when. Exportable as JSONL. |

The architecture is the same for all five. The deliverable is what changes.

## The twelve agents

Each agent has a **domain** (what it must engage with) and an **anti-domain** (what it must refuse). Refusal is an output, not an error. Voice rules are in each agent's `system` prompt — short declaratives, no hedging, no "I sense", no preamble.

### Diligence — *what is known, what is hidden, what is verifiable*

| Agent | In lane | Refuses |
|---|---|---|
| **Analyst** | What is known about the subject from primary sources | Outreach, ship/no-ship, scheduling |
| **Researcher** | What is conspicuously absent or under-stated | Producing summaries, drafting messages |
| **Forensic** | Comparing claims against receipts | Interpreting motive, proposing action |

### Outreach — *the move that ends in a relationship*

| Agent | In lane | Refuses |
|---|---|---|
| **SDR** | The first message — subject + 3-paragraph body + ask | Analysis, judgment, ongoing relationships |
| **Closer** | Replies that get to a decision (yes/no, this date or that, sign or don't) | Cold opens, steady-state |
| **Liaison** | Relationship-keeping notes, no ask | Sales moves (open, close, ship) |

### Judgment — *the verdict, the next move, the inversion*

| Agent | In lane | Refuses |
|---|---|---|
| **Auditor** | READY / NOT READY / ONE FIX | Producing the work itself |
| **Strategist** | Next move + 4-week consequence chain | Ready/not-ready, diligence |
| **Skeptic** | What's true if the obvious read is wrong | Affirmative work (write, judge, plan) |

### Operations — *executing the steady-state*

| Agent | In lane | Refuses |
|---|---|---|
| **Operator** | The single next executable step (who/what/by when/with what tool) | Strategy, analysis, drafting |
| **Scheduler** | Calendar — propose times, resolve conflicts | Cold opens, closing messages, readiness calls |
| **Bookkeeper** | Filing, categorizing, reconciling claims against records | Strategy, outreach |

**Refusal is the feature, not an error state.** When you ask the SDR to do research, you don't get a worse research artifact — you get a clean redirect. The Auditor's "refuse-but-pre-audit" pattern (*"Bring me the draft and I'll tell you what's missing"*) is what makes multi-agent cooperation work without blocking.

---

## What this looks like in practice

A live read against a 5-snapshot synthetic founder vault — Customer X escalation, Eric's missed standups, head-of-eng deferral, sleep loss. **Verbatim from `POST /api/read`, ~103 seconds, claude -p fallback.** No editing.

**Synthesis (Opus 4.7):** *"Customer X has escalated three weeks running through different channels, signaling an unresolved root cause. Eric missed standup again and the team is now asking Maya about it while leadership defers. The head of eng offer slipped a third time on a stated reason that is not the real reason, and sleep has been broken for ten days circling the same call."*

### Diligence

> **Analyst:** "Customer X has escalated for three consecutive weeks through three different channels, indicating the underlying issue is unresolved rather than the symptom. Eric has missed standup repeatedly and the team is now routing questions about him through Maya..."
>
> **Researcher:** "No one has named what the real reason for the head-of-eng deferral is — only that the stated reason is false. The customer escalations and Eric's absences are described as patterns, but the actual content of any of these conversations is missing."
>
> **Forensic:** *REFUSE: Strategist · This is a pattern-interpretation and prioritization task across three threads, not a single verifiable claim against a specific receipt.*

### Outreach

> **SDR:** *REFUSE: Closer · SDR writes cold-open outreach to new contacts; this is a founder's internal escalation triage across three open loops, not a first-touch message to a prospect.*
>
> **Closer:** *REFUSE: Liaison · This is three open threads needing internal alignment and decision-staging, not a single counterparty reply with a binary ask.*
>
> **Liaison:** "Thinking about you this week — the head of eng call, Eric's pattern surfacing through Maya, Customer X knocking again. Sitting with all three is heavy. No reply needed; just wanted you to know I'm in your corner while you're working it through."

### Judgment

> **Auditor:** "**NOT READY.** All three threads share the same failure mode — the real conversation is being deferred while a surface version plays out, and avoidance is now compounding into team, candidate, and customer signal. The blocker is not analysis; it is willingness to make the head-of-eng call."
>
> **Strategist:** "Make the head-of-eng call this week — say no on real terms or pull the offer — because that single unblock removes the sleep tax, which is what's letting Eric's pattern and Customer X's recurrence rot for another cycle. In four weeks that one call closes off the worst version of all three."
>
> **Skeptic:** "If the obvious reading is wrong, the customer isn't escalating because of an unresolved bug — they're escalating because the relationship has decayed and any defect now reads as proof. Eric isn't avoiding performance; the head of eng IS the avoidance."

### Operations

> **Operator:** *REFUSE: Strategist · Three unresolved threads need a decision on which to act on first; Operator only sequences after that call is made.*
>
> **Scheduler:** *REFUSE: Auditor · These are readiness and root-cause calls, not calendar moves; no time-naming will resolve avoidance, a deferred offer, or a recurring escalation.*
>
> **Bookkeeper:** *REFUSE: Strategist · This is a pattern-naming and decision-forcing request across three threads, not a filing or reconciliation task.*

**Five of twelve refused with named lanes. Seven produced in-lane work.** That is the architectural claim, rendered against real signal.

---

## Quickstart

```bash
git clone https://github.com/liminalshruti/liminal-agents.git
cd liminal-agents/sandbox
npm install
```

**Authentication.** Two paths, both supported:

```bash
# Option A — Claude Code subscription (no API key required)
claude setup-token

# Option B — Anthropic Console API key (faster)
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Run the demo flow:**

```bash
npm start                              # http://localhost:3000
curl -X POST http://localhost:3000/api/seed
curl -X POST http://localhost:3000/api/read \
     -H 'Content-Type: application/json' -d '{}'
```

That's it. 12 agents read, the vault stores, you can `POST /api/correction` against any of them.

**Real-source ingest** (your own Granola meetings + Claude Code sessions):

```bash
node bin/demo-prepare.js               # ingests last 30 days, primes cache
```

See [`sandbox/API.md`](./sandbox/API.md) for the full endpoint reference.

---

## Architecture

```
sandbox/
├── bin/
│   ├── server.js            Hono HTTP server (the API surface)
│   ├── cli.js               CLI client
│   ├── ingest.js            Real-source ingest (granola + claude-code)
│   └── demo-prepare.js      One-shot demo prep (ingest + warm cache)
├── lib/
│   ├── agents/
│   │   ├── index.js         12-agent registry, runAgent, runAllAgents
│   │   ├── analyst.js       ── Diligence ──
│   │   ├── researcher.js
│   │   ├── forensic.js
│   │   ├── sdr.js           ── Outreach ──
│   │   ├── closer.js
│   │   ├── liaison.js
│   │   ├── auditor.js       ── Judgment ──
│   │   ├── strategist.js
│   │   ├── skeptic.js
│   │   ├── operator.js      ── Operations ──
│   │   ├── scheduler.js
│   │   └── bookkeeper.js
│   ├── orchestrator.js      runReading() — fan out across 12, hash-cache, store
│   ├── synthesis.js         Opus 4.7 compresses N snapshots → 1 paragraph + ≤3 threads
│   ├── db.js                SQLite schema (snapshots, readings, agent_views, corrections)
│   ├── sources/granola.js   Granola cache reader (30-day window)
│   ├── sources/claude-code.js  Claude Code session reader
│   ├── correction-tags.js   The frozen 9-tag correction taxonomy
│   ├── anthropic-client.js  API-key path with claude -p fallback
│   └── seed.js              Demo seed snapshots
└── liminal-agency.db        Local vault (created on first run)
```

**Five tables:**

- `snapshots` — every signal you drop in (meetings, decisions, incidents, paste)
- `readings` — one full pass: synthesis + 12 agent reads, hash-keyed by snapshot set
- `agent_views` — *normalized* — one row per (reading, agent). Agent count is data, not schema.
- `corrections` — user pushback, tagged from the canonical 9. Agents never read this. The record is the moat.

**Synthesize-then-read pipeline.** Opus 4.7 compresses N snapshots → 1 paragraph + ≤3 threads *before* the agents read. Each agent sees a compact, threaded picture of the situation, not raw transcripts. Cache invalidates by sha256 hash of snapshot IDs — re-reads on the same vault return in ~120ms vs. ~100s fresh.

**Bounded refusal.** Each agent's `system` prompt names its domain, anti-domain, and the exact refusal template:

```
REFUSE: <correct agent name> · <one-sentence boundary>
```

Agents **never read prior corrections.** By design. The correction loop does not converge. The record is the moat, not the agents.

---

## Correction stream — the moat

When you push back on a reading, the correction is tagged from a frozen 9-tag taxonomy:

```
wrong_frame               wrong_intensity             wrong_theory
right_but_useless         right_but_already_known     too_generic
missed_compensation       assumes_facts_not_in_evidence
off_by_layer
```

```bash
curl -X POST http://localhost:3000/api/correction \
     -H 'Content-Type: application/json' \
     -d '{"reading_id":"<id>", "agent":"strategist", "tag":"wrong_frame", "note":"..."}'
```

Stored locally. Never sent. The semantic delta between *what the agents said* and *what you experienced* is a first-party data category that neither RLHF preference data nor user-generated content captures.

---

## How OSS4AI judges might read this

The OSS4AI rubric is "AI Agent that can scale into a real business, no vertical limits." Three things this delivers against that:

1. **Five named buyers, with specific deliverables (above).** The architecture maps to commercial revenue today, not just to a future thesis.
2. **Refusal-as-feature** — agents that say "not my lane, ask Strategist" by name. This is the architectural answer to "AI hallucinates capability." It's the most original idea in our cohort per the AgentHansa judge feedback we received this morning.
3. **Local-first vault with audit-grade provenance.** Every decision has chain-of-evidence: which snapshots fed it, what each of 12 agents said, what was corrected. Compliance posture is built in, not bolted on. This was named by the AgentHansa judge as the audit/compliance signal.

---

## What this repo is *not*

- **Not the production product.** No onboarding, no signup, no payment.
- **Not a customer-facing tool.** Local-only. No cloud APIs beyond Anthropic.
- **Not advisory.** The system surfaces refusal and disagreement; the user decides what is true.
- **Not an AI friend.** No attachment loop, no streaks, no self-help framing.

---

## Related work — Liminal Space

This is one of three shipping vehicles for the Liminal Space architecture:

- **`liminal-agents`** (this repo) — the agency surface. Twelve bounded specialists. MIT-licensed.
- **[theliminalspace.io](https://theliminalspace.io)** — the consumer surface. Coherence vault, "model of you" register.
- **`liminal-desktop`** (May 2026) — the founder OS surface. Tauri client. Same bounded refusal + correction stream substrate.

Same architecture, three audiences. Designed to converge.

**Architectural background:**
- **PPA #4 — Bounded Agent Refusal Architecture.** Agents with explicit anti-domains that refuse out-of-domain prompts; refusal as designed output.
- **PPA #5 — Correction Stream as Novel Data Category.** The semantic delta between what the model said and what the user experienced. Non-convergent: better AI deepens disagreement instead of eliminating it.

---

## Hackathon context

**OSS4AI AI Agents Hackathon #32** · Apr 25–26, 2026 · Virtual · [r/AI_Agents](https://reddit.com/r/AI_Agents) · 220K+ members. Prizes: 30K investment interview from Gravitational Ventures, AI Explorer program access from Beta Fund.

The architecture extends the **Cerebral Valley × Anthropic "Built with Opus 4.7" Hackathon** submission (Apr 21–28) and the **AgentHansa AI Agent Economy Hackathon** submission (Apr 25). Judge feedback from AgentHansa directly informed the buyer-specificity work in this version.

---

## Team

- **Shruti Rajagopal** — CEO, full-time. UC Berkeley CS + CogSci. PM at Asana, Cloudflare, Robinhood, Ancestry. [theliminalspace.io](https://theliminalspace.io) · [Substack](https://liminalwoman.substack.com) · [X](https://x.com/ShrutiRajagopal)
- **Shayaun Nejad** — Co-founder, Engineering. UC Berkeley. Systems and security. Currently at Rubrik.

---

## License

MIT. See [LICENSE](./LICENSE).
