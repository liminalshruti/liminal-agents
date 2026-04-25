# Liminal Agents

> Telemetry for your own thinking. Reads the surfaces where your work actually happens. Emits multi-axis readings of what you're working on, tracked across weeks.

A Claude Code plugin built for the **Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon** (Apr 21–28, 2026).

Most knowledge work happens across surfaces no one stitches back together. Granola has your meetings. Claude Code has your sessions. Git has the commits. By Friday, what you decided on Monday is gone.

Liminal Agents ingests the surfaces, runs three bounded agents over each signal, and writes the readings to a local SQLite vault. The agents disagree by design — three orthogonal axes per signal, not one consensus answer. Over time the record shows drift, recurrence, and the threads you keep circling without closing.

This release ships Granola, Claude Code, and Git readers. The substrate is source-agnostic; additional readers slot in without touching the data model.

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
claude setup-token          # one-time; inherits your Claude subscription auth
npm run setup
npm run backfill            # one-shot ingest from Granola + ~/.claude
npm run daemon:install      # macOS only; registers io.liminal.substrate
claude --plugin-dir .
```

### Anthropic credentials

Two paths, picked transparently by `lib/anthropic-client.js`:

**A. Console API key** (faster, full control over `max_tokens` / `temperature` / parallelism):
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

**B. Claude Code subscription** (no separate billing, slower, resource-heavy — see warning):
```bash
claude setup-token   # one-time; OAuth token stored in macOS Keychain
```

When no `sk-ant-api03-` key is set, the substrate falls back to spawning `claude -p` for inference. The OAuth token is read from Keychain by the CLI itself — no env wiring needed. Latency is ~5–10s per call vs. ~0.5–2s for the direct API.

> **Warning — CLI mode is heavy.** Each `claude -p` invocation boots a full Claude Code runtime, including every MCP server in your global config (Atlassian, Drive, Playwright, etc. — easily 1–2 GB RAM apiece). The substrate forces all CLI calls to run **single-flight** (one at a time, no parallelism) and the daemon **skips thread-detection** in CLI mode to stop a 5-minute resource leak. Even so, `/check` takes 25–40s and `/close` takes 60–120s. For demo or live use, an API key is strongly recommended.

The daemon logs which mode is active at startup as `anthropic_mode: api | cli | none`.

`npm run setup` is idempotent. It creates the vault directory, writes default `integrations.json` if absent, migrates stub source entries to real readers when one ships, and imports `~/.liminal-agents-vault.db` into the new substrate tagged `vault_origin='legacy-import'` on first run.

`npm run backfill` runs a single ingest tick against every enabled real source so the vault has telemetry immediately, without waiting for the daemon's first poll.

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

- **granola** — reads meeting docs and transcripts from the local Granola cache at `~/Library/Application Support/Granola/cache-v6.json` (register: inner)
- **claude-code** — walks `~/.claude/projects/**/*.jsonl` for user messages (register: inner)
- **git** — scans configured repo paths for new commits (register: operational)

Override the Granola cache location with `LIMINAL_GRANOLA_PATH` (used by tests; rarely needed in production).

Not yet implemented, wired as stubs: `calendar`, `knowledgeC`, `imessage`, `obsidian`. Enabling them in `integrations.json` logs a noop until the reader ships.

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
