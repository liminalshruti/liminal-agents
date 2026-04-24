# Liminal Agents

> A CLI surface on the Liminal substrate. Three agents read your state. They disagree. Your correction becomes data.

A Claude Code plugin built for the **Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon** (Apr 21–28, 2026). It is the publishable edge of one architectural idea: a background substrate that ingests local signals, bounded agents that deliberate over them, and a correction stream that never converges.

## Scope

**This is a hackathon-week prototype.** It is not the Liminal Space production system. It runs locally, writes to a SQLite vault under `~/Library/Application Support/Liminal/`, and is MIT-licensed so the architecture is inspectable.

The production product (a desktop workspace for founders, operators, and creatives at agentic scale) ships from a separate, private codebase. This repo is one substrate idea reduced to the smallest thing that demonstrates it.

## Thesis

Most AI products succeed when users accept the output. Liminal Agents succeeds when users push back.

Three agents with bounded jurisdiction — **Architect**, **Witness**, **Contrarian** — read the same signal and produce different interpretations. The user's correction becomes a new data category: the semantic delta between what the model said and what the user experiences.

The correction loop does not converge. Agents do not adapt to prior corrections. The record is the moat, not the agents.

## Architecture

```
~/Library/Application Support/Liminal/
  vault.db                  SQLite (signal_events, deliberations, corrections, surfacing_events)
  integrations.json         per-source toggles
  integrations/<source>/    per-source cache + cursor
  schemas/                  JSON Schema files copied on init
  daemon.log                pino-formatted log

~/Library/LaunchAgents/
  io.liminal.substrate.plist   launchd user agent for the daemon
```

### Four tables, one correction schema

- **signal_events** — every observed signal (register: inner | operational)
- **deliberations** — one three-agent read, triggered by /check or /close
- **corrections** — one canonical-tagged delta per wrong reading
- **surfacing_events** — daemon-initiated prompts (close, stub: open-loop, stuck, etc.)

Every row carries `schema_version` and `vault_origin` (`native` or `legacy-import`).

### Canonical correction tags

```
wrong_frame               wrong_intensity             wrong_theory
right_but_useless         right_but_already_known     too_generic
missed_compensation       assumes_facts_not_in_evidence
off_by_layer
```

### Bounded agents

Each agent has a domain and an anti-domain. Refusal is an output, not an error. System prompts are hardcoded in `lib/agents/*.js` and never reference user history.

- **Architect** — structure, pattern, system constraint. Anti-domain: felt experience.
- **Witness** — embodied signal, what is being held. Anti-domain: strategy.
- **Contrarian** — inversion, dangerous questions. Anti-domain: consensus.

## Install

```bash
git clone https://github.com/liminalshruti/liminal-agents.git
cd liminal-agents
npm install
export ANTHROPIC_API_KEY=sk-...
npm run setup
npm run daemon:install      # macOS only; registers io.liminal.substrate
claude --plugin-dir .
```

`npm run setup` is idempotent. It creates the vault directory, writes default `integrations.json` if absent, and imports `~/.liminal-agents-vault.db` into the new substrate tagged `vault_origin='legacy-import'` on first run.

## Use

### /check — forced-choice snapshot

```
/liminal-agents:check
```

Three binary questions, three bounded reads, one correction.

### /close — end-of-day synthesis

```
/liminal-agents:close
```

Or from the daemon notification:

```
/liminal-agents:close --surfacing-id=<uuid>
```

Opus 4.7 synthesizes today's signals into one paragraph and up to three threads; the agents read the synthesis; you correct one.

### /history — read-only record

```
/liminal-agents:history
/liminal-agents:history --since-days=30
```

Landed-vs-corrected per agent, broken down by canonical correction tag.

### Daemon

The daemon polls every 5 minutes (override with `LIMINAL_POLL_SEC`). Sources in this release:

- **claude-code** — walks `~/.claude/projects/**/*.jsonl` for user messages (register: inner)
- **git** — scans configured repo paths for new commits (register: operational)

Not yet implemented, wired as stubs: `granola`, `calendar`, `knowledgeC`, `imessage`, `obsidian`. Enabling them in `integrations.json` logs a noop until the reader ships.

Thread detection runs each tick via Haiku 4.5, grouping untethered signals. Triggers: evening close at 18:30 local if ≥5 signals landed and no close has been surfaced today. All other triggers (open-loop, stuck, cross-register-conflict, focus-mode) are stubs.

### URL scheme

```bash
npm run daemon:install             # registers io.liminal.substrate
bash scripts/register-url-scheme.sh # registers liminal:// URL scheme
```

Clicking the evening-close notification opens `liminal://close?surfacing_id=<uuid>`, which marks the surfacing accepted and points the user to `/close`.

## Testing

```bash
npm test
```

Three suites:

- `test/orchestrator.test.js` — vault write paths for /check + tag enforcement
- `test/daemon-ingest.test.js` — claude-code and git source readers
- `test/surfacing-flow.test.js` — trigger -> surfacing_event -> /close -> correction round trip

## What this repo is not

- Not the production product. No onboarding, no signup, no payment.
- Not a customer-facing tool. Local-only. No cloud APIs beyond Anthropic.
- Not a companion. No attachment loop. No streaks, scores, or wellness framing.
- Not advisory. The system surfaces disagreement; the user decides what is true.

## License

MIT. See [LICENSE](./LICENSE).

## About

Built by the Liminal Space co-founding team:

- **Shruti Rajagopal** (CEO, full-time) · [theliminalspace.io](https://theliminalspace.io) · [Substack](https://liminalwoman.substack.com) · [X](https://x.com/ShrutiRajagopal)
- **Shayaun Nejad** (Co-founder, Engineering, part-time — continuing at Rubrik) · UC Berkeley · systems and security · OffSec-certified · CHI 2027 paper co-author

Part of [Liminal Space](https://theliminalspace.io) — a desktop workspace for founders, operators, and creatives at agentic scale.
