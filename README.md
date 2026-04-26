# Liminal Agents

> **Three bounded agents that compete on real B2B work. They refuse out of lane. The vault remembers what you correct.**

A Claude Code plugin built for the **AI Agent Economy Hackathon** (Topify AI / AgentHansa, Apr 25, 2026). Solo founders pay agencies $500/month for diligence prep, cold outreach, ship/no-ship reviews. Most AI agents hallucinate when they're out of depth. Liminal Agents are bounded — each one refuses work outside its lane and names the correct agent.

## The three agents

| Agent | In lane | Anti-domain (refuses) |
|---|---|---|
| **Analyst** | diligence, competitive teardowns, market research, data enrichment | outreach (→ SDR), ship/no-ship calls (→ Auditor) |
| **SDR** | outreach, cold email, follow-ups, calendar moves | research (→ Analyst), ship decisions (→ Auditor) |
| **Auditor** | judges readiness, names gaps, refuses what isn't ready | producing the work itself (→ Analyst or SDR) |

Refusal is not an error state. **Refusal is the feature.** When the SDR tries to do research, you don't get a worse research artifact — you get a clear redirect. The agent knows what it is for.

## Bigger picture: a transition workspace, not an AI workspace

AI is a capability, not a category. The product is the workspace; the agents are infrastructure. **Liminal is a transition workspace for unresolved context** — for the moments before something becomes a note, a task, a plan, a decision, or an identity-level commitment.

Founders and creators live in unresolved decisions all the time. The substrate this hackathon ships — bounded refusal, encrypted vault, correction stream — is what makes a transition workspace trustworthy: agents that won't pretend, a record that won't leak, a memory that's yours.

The hackathon submission demonstrates one slice (B2B agency-priced work). The architecture supports the full surface.

## Quickstart

```bash
git clone https://github.com/liminalshruti/liminal-agents.git
cd liminal-agents
npm install
export ANTHROPIC_API_KEY=sk-ant-api03-...   # or use claude setup-token for OAuth
npm run setup
```

Try the demo flow against a synthetic seeded vault:

```bash
export LIMINAL_VAULT_DIR=$(mktemp -d)
export LIMINAL_VAULT_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
node scripts/seed-demo.js
node bin/liminal-tui.js "competitive teardown of perplexity.ai"
```

Three agent panes render. The Analyst produces a teardown. The SDR refuses ("that's the Analyst's lane"). The Auditor refuses ("I judge work; I don't produce it").

Then run a different lane:

```bash
node bin/liminal-tui.js "draft a cold email to a16z about our Series A"
```

This time the SDR is in lane and produces the email. The Analyst refuses. The Auditor refuses *until you give it a draft to judge*.

## What this is, in three registers

**1. The hackathon submission** — a Claude Code plugin where three bounded B2B agents respond to founder tasks, route refusals by lane, and persist every deliberation to a local SQLCipher-encrypted vault.

**2. The IP credibility play** — inspectable evidence anchor for two pending PPAs. **PPA #4 (Bounded Agent Refusal)**: agents that actively refuse out-of-domain work, refusal as designed output. **PPA #5 (Correction Stream)**: a first-party data category produced when users push back on AI reads. The vault's correction taxonomy and agent statelessness are the patent claims.

**3. The substrate for the personalized epistemic agent** — Liminal at the desktop layer is *a personalized epistemic agent that ingests the user's full intellectual biography and synthesizes it into a living model of expertise*. Bounded refusal and the correction stream are the substrates that make this trustworthy. The hackathon ships the substrates; the desktop MVP ships the agent that uses them.

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

### Four tables

- **signal_events** — every observed signal (register: `inner` | `operational`)
- **deliberations** — one three-agent read, triggered by `/check`, `/close`, or `/agency`
- **corrections** — one canonical-tagged delta per wrong reading
- **surfacing_events** — daemon-initiated prompts to the user

Every row carries `schema_version` and `vault_origin` (`native` or `legacy-import`).

### Canonical correction tags

```
wrong_frame               wrong_intensity             wrong_theory
right_but_useless         right_but_already_known     too_generic
missed_compensation       assumes_facts_not_in_evidence
off_by_layer
```

### Bounded agents

Each agent has a domain and an anti-domain. Refusal is an output, not an error. System prompts are hardcoded in `lib/agents/*.js` and **never reference user history** — agents do not converge.

```js
// lib/agents/analyst.js (excerpt)
"Your anti-domain: outreach, drafting messages, contacting people.
 That's the SDR. If asked to send something, refuse explicitly:
 \"That's the SDR's lane. I do the research; the SDR runs the move.\""
```

The refusal-and-name-the-correct-agent clauses operationalize PPA #4 at runtime. Currently agents *describe* their anti-domain *and* refuse when prompted into it. This is what makes the demo work in 60 seconds.

## Authentication

The plugin works with either a Console API key or a Claude Code OAuth session.

**API key (faster, recommended for production):**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

**OAuth via Claude Code (no key required, uses your subscription):**
```bash
claude setup-token       # one-time
# Daemon and skills will use claude -p as inference shim
```

CLI mode is ~5–10x slower (subprocess spawn + Claude Code bootstrap) and runs at Claude Code's default temperature/max_tokens. For demo recording or low-latency use, set the API key.

## Use

### /agency — three-agent B2B run

```
/liminal-agents:agency competitive teardown of granola.ai
/liminal-agents:agency draft cold email to maya at northstar capital
/liminal-agents:agency is this email ready to send: 'Subject: hello, Body: ...'
```

The in-lane agent produces. The others refuse and name the correct agent.

### /check — forced-choice snapshot (legacy surface)

```
/liminal-agents:check
```

Three binary questions, three bounded reads. Predates the agency reframe; kept for backward compat.

### /close — end-of-day synthesis

```
/liminal-agents:close
```

Daemon-triggered at 18:30 local if ≥5 signals landed today. Synthesizes the day, runs the three agents on the synthesis.

### /history — read-only record

```
/liminal-agents:history
/liminal-agents:history --since-days=30
```

Landed-vs-corrected per agent, broken down by canonical correction tag.

### Ink TUI

```bash
node bin/liminal-tui.js "<task description>"
```

The demo surface. Three agent panes, color-coded status, structured output. Works inside tmux.

### Daemon

The daemon polls every 5 minutes (override with `LIMINAL_POLL_SEC`). Real sources:

- **claude-code** — walks `~/.claude/projects/**/*.jsonl` for user messages (register: inner)
- **git** — scans configured repo paths for new commits (register: operational)
- **granola** — reads `~/Library/Application Support/Granola/cache-v6.json` for meeting notes + transcripts (register: inner)

Stubs: `calendar`, `knowledgeC`, `imessage`, `obsidian`.

Thread detection runs each tick via Haiku 4.5. Triggers: evening close at 18:30 local. All other triggers (open-loop, stuck, cross-register-conflict, focus-mode) are stubs.

### URL scheme

```bash
npm run daemon:install               # registers io.liminal.substrate
bash scripts/register-url-scheme.sh  # registers liminal:// URL scheme
```

Clicking the evening-close notification opens `liminal://close?surfacing_id=<uuid>`, which marks the surfacing accepted.

## Testing

```bash
npm test
```

Per-file:
- `test/orchestrator.test.js` — vault write paths + tag enforcement
- `test/daemon-ingest.test.js` — claude-code, git, and granola source readers
- `test/surfacing-flow.test.js` — trigger → surfacing_event → /close → correction round trip
- `test/vault-crypto.test.js` — SQLCipher v4 profile pinning + key handling

## What this repo is not

- Not the production product. No onboarding, no signup, no payment.
- Not a customer-facing tool. Local-only. No cloud APIs beyond Anthropic.
- Not a companion. No attachment loop, no streaks, no wellness framing.
- Not advisory. The system surfaces refusal and disagreement; the user decides what is true.

## Related work

This plugin is one of two shipping vehicles for the Liminal architecture. The desktop MVP (`liminal-desktop`, May 2026) is the production surface for the personalized epistemic agent — the same bounded refusal + correction stream substrate, rendered in a Tauri client with visual artifacts instead of a CLI. The plugin's vault schema and agent prompts are designed to converge with the desktop client.

For background on the architecture and the IP claims:
- **PPA #4 — Bounded Agent Refusal** — agents with explicit anti-domains that refuse out-of-domain prompts; refusal as designed output, not error state.
- **PPA #5 — Correction Stream** — a first-party data category produced when users push back on AI reads; the semantic delta between what the model said and what the user experiences.

## Hackathon context

Submitted to the **AI Agent Economy Hackathon** by Topify AI / AgentHansa on April 25, 2026. Hackathon prompt: *"What would a business pay an agency $500/month to do?"* Judges: Alex Newman (claude-mem), Artin Bogdanov (SUN, a16z Speedrun SR006), Nishkarsh Srivastava (HydraDB), Gary Qi (ByteDance Trae).

Three of four judges build memory infrastructure for AI agents. The vault's encrypted local correction record is a memory layer for bounded agents; the architecture is designed for that category.

## License

MIT. See [LICENSE](./LICENSE).

## About

Built by the Liminal Space co-founding team:

- **Shruti Rajagopal** (CEO, full-time) · [theliminalspace.io](https://theliminalspace.io) · [Substack](https://liminalwoman.substack.com) · [X](https://x.com/ShrutiRajagopal)
- **Shayaun Nejad** (Co-founder, Engineering, part-time — continuing at Rubrik) · UC Berkeley · systems and security · OffSec-certified · CHI 2027 paper co-author

Part of [Liminal Space](https://theliminalspace.io) — a desktop workspace for founders, operators, and creatives at agentic scale.
