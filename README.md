# Liminal Agents

```
                              ◇  ◆  ◇

      task ─────► ┌─────────────┬─────────────┬─────────────┐
                  │   ANALYST   │     SDR     │   AUDITOR   │
                  │  diligence  │  outreach   │  judgment   │
                  ├─────────────┼─────────────┼─────────────┤
                  │  COMPLETE   │  REFUSED    │  REFUSED    │
                  │             │  → Analyst  │  → Analyst  │
                  │  teardown.  │             │             │
                  │  3 paras.   │             │             │
                  │  fetched.   │             │             │
                  └─────────────┴─────────────┴─────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   vault (sqlcipher) │
                          │   deliberation.v1   │
                          │   correction.v1     │
                          └─────────────────────┘

           refusal is the feature.  the record is the moat.
```

> **Three bounded specialists that do agency-priced work locally. Each refuses out of lane and names the right agent. The vault keeps the record.**

A Claude Code plugin built for the [**AI Agent Economy Hackathon**](https://luma.com/jmfpws97) — Topify AI / AgentHansa, Apr 25, 2026. Solo founders pay agencies $500/month for the same three things: diligence prep, cold outreach, and ship/no-ship reviews. Most AI agents hallucinate when out of depth. Liminal Agents are bounded — each one refuses work outside its lane and names the correct agent, by name.

## TL;DR

- **Three bounded agents.** Analyst, SDR, Auditor. Each one does one thing.
- **Refusal as designed output.** The agent out of lane names the agent in lane.
- **Local-first vault.** SQLCipher-encrypted. Every deliberation persists.
- **Correction stream.** When you push back on a read, the correction is first-party data.
- **Ships as a Claude Code plugin.** `claude -p` OAuth or `ANTHROPIC_API_KEY`.

**Jump to:** [Live runs](#what-this-looks-like-in-practice) · [Quickstart](#quickstart) · [Rubric scoring](#how-it-scores-against-the-agenthansa-rubric) · [Architecture](#architecture) · [Skills](#skills) · [Hackathon judges](#hackathon-context)

| Agent | In lane | Refuses (and names) |
|---|---|---|
| **Analyst** | diligence, competitive teardowns, market research, data enrichment | outreach (→ SDR) · ship/no-ship calls (→ Auditor) |
| **SDR** | outreach, cold email, follow-ups, calendar moves | research (→ Analyst) · ship decisions (→ Auditor) |
| **Auditor** | judges readiness, names gaps, refuses what isn't ready | producing the work itself (→ Analyst or SDR) |

**Refusal is the feature, not an error state.** When the SDR is asked to do research, you don't get a worse research artifact — you get a clean redirect.

---

## What this looks like in practice

Two real runs against a fresh seeded vault, no edits, ~30s each via `claude -p` OAuth. Outputs verbatim from `node skills/agency/run.js`.

### Run 1 — `competitive teardown of granola.ai`

The Analyst pre-fetched `https://granola.ai` (1,500 bytes after stripping HTML), then produced a 4-paragraph structured teardown naming Granola's $125M Series C, the moat thesis (corpus, not transcription), competitive splits against Otter / Fireflies / Tuesday.ai, and the OS-incumbent risk.

<details>
<summary><strong>Read the full Analyst teardown ↓</strong></summary>

> Granola is winning the meeting-notes category by collapsing the category itself: it is not a recorder, not a transcription tool, and not a CRM enrichment layer — it is a notepad that happens to listen. The $125M Series C confirms the bet: distribution through individual ICs in back-to-back meetings, then expansion into company-wide context. The defensible asset is the accumulated meeting corpus per user, not the transcription pipeline.
>
> The product surface is deliberately narrow. Three pillars on the homepage — Notepad, Chat, iPhone — and the demo is a single intro-call screenshot. Compare this to Otter, Fireflies, Fathom, tl;dv, all of which lead with feature matrices (transcription accuracy, integrations, summarization templates). Granola leads with a writing experience. That positioning lets them charge a premium and avoid the commodity transcription race to zero. The Tuesday.ai jab embedded in the demo screenshot ("$180 per employee per year, too expensive, too complex") is a direct competitive frame against incumbent enterprise note-takers.
>
> The Series C language — "put your company's context to work" — signals the next move: org-level memory and agentic chat over the meeting graph. This is where Granola becomes hard to displace and where the moat compounds. Every meeting captured is training data for a per-company retrieval layer no competitor can replicate without years of usage. The risk is the same risk every notes app faces: Apple, Google, and Microsoft can ship a "good enough" version inside the OS or productivity suite, and the single-purpose tool gets squeezed.
>
> The implication is that Granola's defensibility lives in the writing experience and the corpus, not the AI — anyone teardown-ing them should study the editor, not the transcription stack.

</details>

In the same run, the other two agents refused with named lanes:

> **SDR:**
> REFUSE: Analyst
> Competitive teardowns and market research are the Analyst's lane. I run outreach; the Analyst does the homework.

> **Auditor:**
> REFUSE: Analyst
> Producing a competitive teardown is the Analyst's lane. Bring me the teardown and I'll tell you what's missing.

### Run 2 — `draft a cold email to Maya at Northstar Capital`

The SDR was in lane this time. With Maya's investor-call notes already in the vault (synthetic seed), it produced:

> Subject: 30 min on the agentic-workspace moat
>
> Maya — following up on our exchange. The piece worth your time is the moat shape: bounded multi-agent deliberation plus a correction-stream substrate that compounds with use, not a wrapper that decays.
>
> Northstar's recent notes on workflow-native AI line up with where this is heading. I'd rather show you the substrate live than describe it — fifteen minutes is enough to see whether the thesis lands.
>
> Open Tuesday or Thursday afternoon next week for 30 minutes? I'll send two times once you pick a day.
>
> Shruti
> Liminal Space

The Analyst and Auditor both refused, with the Auditor pre-loading its audit criteria for when the draft comes back:

> **Analyst:**
> REFUSE: SDR
> Drafting outreach is the SDR's lane. I do the research; the SDR runs the move.

> **Auditor:**
> REFUSE: SDR
> Drafting outreach is the SDR's lane. Bring me the draft and I'll tell you what's missing.

That last move — **the Auditor refusing to produce, then routing the user toward what would make it useful next** — is what bounded multi-agent cooperation looks like in practice. Refusal isn't blocking; it's routing.

---

## Quickstart

```bash
git clone https://github.com/liminalshruti/liminal-agents.git
cd liminal-agents
npm install
npm run setup
```

**Authentication.** Two paths, both supported:

```bash
# Option A — Claude Code subscription (no API key required)
claude setup-token

# Option B — Anthropic Console API key (faster, ~5–10x lower latency)
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

The plugin auto-detects which is available and falls back gracefully.

**Try the live demo flow:**

```bash
export LIMINAL_VAULT_DIR=$(mktemp -d)
export LIMINAL_VAULT_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
node scripts/seed-demo.js
node bin/liminal-tui.js "competitive teardown of granola.ai"
```

The TUI renders three color-coded agent panes (cyan / yellow / magenta). The in-lane agent shows `ACTIVE → COMPLETE` with full output; the out-of-lane agents show `REFUSED` with the refusal text in distinct color. Vault writes happen automatically.

---

## How it scores against the AgentHansa rubric

| Dimension | Weight | What this delivers |
|---|---|---|
| **Business Value** | 30% | Replaces the three core agency-retainer line items: competitive teardowns ($2-5K each), outbound drafting ($1-3K/month), and ship/no-ship reviews (the unbillable but constant cost of being a small team). Total addressable replacement: ~$10K/month per founder. |
| **Output Quality** | 30% | See above — both example runs are unedited. The Analyst produces structured 4-paragraph teardowns with named ICP, three-way competitive splits, and explicit moat theses. The SDR produces sub-80-word emails with hook / specific reason / calibrated ask. URL pre-fetch grounds outputs in real source content. |
| **Innovation** | 20% | **Refusal-as-feature** — agents actively decline out-of-lane work and name the correct agent, by name. This is operationalized PPA #4 (Bounded Agent Refusal Architecture). The Auditor's "refuse-but-pre-audit" pattern is what makes multi-agent cooperation work without blocking. |
| **Long-term Potential** | 20% | Local-first SQLCipher-encrypted vault. MIT-licensed substrate. Schema-stable correction taxonomy (9 canonical tags) so corrections compound across sessions. Designed to plug into a desktop client (`liminal-desktop`, May 2026) with the same prompts and schema — the plugin is where the substrate ships first; the desktop is where it grows. |

---

## Architecture

```
~/Library/Application Support/Liminal/
  vault.db                  SQLCipher v4 encrypted (signal_events, deliberations,
                              corrections, surfacing_events)
  integrations.json         per-source toggles
  integrations/<source>/    per-source cache + cursor
  schemas/                  JSON Schema files copied on init
  daemon.log                pino-formatted log

~/Library/LaunchAgents/
  io.liminal.substrate.plist   launchd user agent for the daemon
```

**Four tables.** `signal_events` (every observed signal, register: `inner` | `operational`); `deliberations` (one three-agent read per task); `corrections` (canonical-tagged user pushback — *the product*); `surfacing_events` (daemon-initiated prompts).

**Bounded agents.** System prompts hardcoded in `lib/agents/*.js`. Each agent's prompt names its domain, anti-domain, and the exact refusal template. Agents **never read prior corrections** — by design. The correction loop does not converge. The record is the moat, not the agents.

**Three-agent orchestrator.** `skills/agency/run.js` runs all three agents **in parallel** against one task via `Promise.all`. URL pre-fetch lives here too: detects URLs and bare domains in the task, fetches the homepage with **SSRF guards** (private-IP blocking, manual redirect, scheme allowlist), strips HTML to ~8KB of text, and passes it as `context` to the agents. SSRF mitigation in `safeFetch()` blocks **RFC1918 ranges, loopback, link-local 169.254/16 (cloud metadata), IPv6 ULA, and DNS-rebinding attempts**. See PR #9.

**Canonical correction tags** (frozen at v1):

```
wrong_frame               wrong_intensity             wrong_theory
right_but_useless         right_but_already_known     too_generic
missed_compensation       assumes_facts_not_in_evidence
off_by_layer
```

When you push back on an agent's output, the correction is tagged from this taxonomy and stored. Agents don't see it — but the record grows.

---

## Bigger picture: a transition workspace, not an AI workspace

AI is a capability, not a category. The product is the workspace; the agents are infrastructure. **Liminal is a transition workspace for unresolved context** — for the moments before something becomes a note, a task, a plan, a decision, or an identity-level commitment.

Founders and creators live in unresolved decisions all the time. The substrate this hackathon ships — bounded refusal, encrypted vault, correction stream — is what makes a transition workspace trustworthy: agents that won't pretend, a record that won't leak, a memory that's yours.

This hackathon ships one slice (B2B agency-priced work). The architecture supports the full surface.

---

## Skills

| Skill | What it does | Surface |
|---|---|---|
| **`/agency`** | Three-agent B2B run. In-lane agent produces; others refuse and name the correct agent. | The AgentHansa-aligned surface. |
| **`/check`** | Three forced-choice questions for a quick state snapshot. | Substrate surface. |
| **`/close`** | Synthesizes the day's signals (Granola meetings, Claude Code messages, git commits) into one paragraph + three threads, then runs the agents over the synthesis. | Substrate surface. |
| **`/history`** | Shows the landed-vs-corrected matrix per agent. | Substrate surface. |

### `/agency` examples

```
/liminal-agents:agency competitive teardown of granola.ai
/liminal-agents:agency draft cold email to maya at northstar capital
/liminal-agents:agency is this email ready to send: 'Subject: hello, Body: ...'
```

### Daemon (background)

`liminal-substrated` polls every 5 minutes.

- **Real sources:** `claude-code` (user messages from `~/.claude/projects/**/*.jsonl`), `git` (commits in configured repos), `granola` (meeting notes + transcripts from `~/Library/Application Support/Granola/cache-v6.json`).
- **Stubs:** `calendar`, `obsidian`, `apple_reminders`.
- **Thread detection:** every tick via Haiku 4.5.
- **Evening close:** fires at 18:30 local if ≥5 signals landed.

> **Privacy note.** The Granola cache contains commingled personal/operational content. The hackathon demo uses **synthetic seed transcripts only** (`scripts/seed-demo.js`) — never the real cache. Production-grade source filtering is a post-hackathon design problem, explicitly named in `SPEC.md` §4.2.

---

## Testing

```bash
npm test
```

Five suites, 20 tests:
- `test/orchestrator.test.js` — vault writes + tag enforcement
- `test/daemon-ingest.test.js` — claude-code, git, granola source readers
- `test/surfacing-flow.test.js` — trigger → surfacing_event → /close → correction round trip
- `test/vault-crypto.test.js` — SQLCipher v4 profile pinning + key handling
- `test/granola-ingest.test.js` — granola cache parsing + filter behavior

20/20 pass on every PR.

---

## Hackathon context

Submitted to the **AI Agent Economy Hackathon** by Topify AI / AgentHansa on April 25, 2026. Hackathon prompt: *"What would a business pay an agency $500/month to do?"*

**Judges:**
- **Alex Newman** — Founder, Claude-Mem ([github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)). Building the memory layer for AI agents. 60K+ stars, trending #1.
- **Artin Bogdanov** — Co-Founder & CEO, [SUN](https://sunapp.ai). a16z Speedrun SR006. "Audible meets ChatGPT."
- **Nishkarsh Srivastava** — CEO, HydraDB. Memory layer for agents.
- **Gary Qi** — Developer Operations Manager, Trae @ ByteDance.

Three of four judges build memory infrastructure for AI agents. **The vault's encrypted local correction record is a memory layer for bounded agents** — the architecture is designed for that category.

---

## What this repo is not

- **Not the production product.** No onboarding, no signup, no payment.
- **Not a customer-facing tool.** Local-only. No cloud APIs beyond Anthropic.
- **Not an AI friend.** No attachment loop, no streaks, no self-help framing.
- **Not advisory.** The system surfaces refusal and disagreement; the user decides what is true.

---

## Related work

This plugin is one of two shipping vehicles for the Liminal architecture. The desktop MVP (`liminal-desktop`, May 2026) is the production surface for the personalized epistemic agent — same bounded refusal + correction stream substrate, rendered in a Tauri client with visual artifacts instead of a CLI. The plugin's vault schema and agent prompts are designed to converge with the desktop client.

For the architectural background:
- **PPA #4 — Bounded Agent Refusal** — agents with explicit anti-domains that refuse out-of-domain prompts; refusal as designed output.
- **PPA #5 — Correction Stream** — a first-party data category produced when users push back on AI reads; the semantic delta between what the model said and what the user experienced.

---

## License

MIT. See [LICENSE](./LICENSE).

## About

Built by the Liminal Space co-founding team:

- **Shruti Rajagopal** (CEO, full-time) · [theliminalspace.io](https://theliminalspace.io) · [Substack](https://liminalwoman.substack.com) · [X](https://x.com/ShrutiRajagopal)
- **Shayaun Nejad** (Co-founder, Engineering, part-time — continuing at Rubrik) · UC Berkeley · systems and security · OffSec-certified · CHI 2027 paper co-author

Part of [Liminal Space](https://theliminalspace.io) — a transition workspace for founders, operators, and creatives.
