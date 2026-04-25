# liminal-agents — agent guide

A Claude Code plugin built for the CV × Anthropic "Built with Opus 4.7" hackathon (Apr 21–28, 2026). See README.md for the human-facing spec.

## Repo scope (reinforces README)

This is a **hackathon-week prototype**, not the production Liminal Space product. The codebase is intentionally small (~500 lines target) to make the architectural idea — bounded multi-agent deliberation + correction-stream data model — inspectable.

When working here, optimize for:
- **Architectural clarity** over feature breadth
- **Read-once comprehension** by hackathon judges
- **MIT-license-friendly minimalism** — no proprietary patterns, no production-only abstractions

## What's NOT this repo's job

- It is not the production product. Don't add features that imply it is.
- It is not a customer-facing tool. No onboarding, no signup, no payment.
- It is not where the Liminal Space brand canon lives. For brand decisions, see `~/liminal/liminal-creative/`.
- It is not where the thesis is canonical. For thesis, see `~/liminal/founder-brain/liminal-ip/THESIS.md`.

## Stack

- **Runtime:** Claude Code plugin (`.claude-plugin/plugin.json` manifest) + a launchd-managed background daemon
- **Language:** JavaScript (ESM, Node 20+)
- **Storage:** Local SQLite at `~/Library/Application Support/Liminal/vault.db`. Legacy `~/.liminal-agents-vault.db` auto-imports on first run.
- **AI:** Anthropic SDK — Opus 4.7 for deliberation (/check, /close); Haiku 4.5 for thread detection

## Substrate shape (v0.2)

Four canonical tables: `signal_events`, `deliberations`, `corrections`, `surfacing_events`. Every row has `schema_version` and `vault_origin`. JSON Schema files live in `schemas/` and are copied into the vault's `schemas/` dir on init so the data is inspectable without the code.

Correction taxonomy is frozen in `lib/correction-tags.js` — nine tags, additions require the schema to bump.

Bounded agent prompts live one-per-file in `lib/agents/*.js` and are never mutated by correction data. If you are editing an agent, edit the prompt, not the caller.

## Agent guidelines for THIS code

1. **Don't add new dependencies.** v0.2 added pino; that was intentional. Further adds need justification in the commit message.
2. **Match existing style.** No type system (plain JS), small files, no class hierarchies. Read `skills/check/orchestrator.js` and `bin/liminal-substrated.js` for the pattern.
3. **Keep the three agents bounded.** Architect / Witness / Contrarian have explicit anti-domains. Don't let them blur into general-purpose agents. Don't let them read corrections.
4. **Vault schema is locked.** Don't migrate tables mid-hackathon — judges may inspect existing data. Add fields only via new `schema_version`.
5. **Correction loop does not converge.** Don't write code that adapts agents to past corrections. The record is the moat.
6. **No emojis in commits, code, or copy.** (Per global Liminal Space convention.)

## Liminal Space context

- Brand voice: short declaratives, no hedging. "Three agents read your state. They disagree." not "Three intelligent agents collaboratively interpret..."
- Banned words: transformation, journey, companion, unlock, manifest, healing, optimize, breakthrough, flourishing, wellness, emotional intelligence, empathic. (Enforced by `~/.claude/hooks/banned-words.sh`.)
- Founder bio hard stops: Shruti is NOT Stanford GSB, NOT SPC fellow. UC Berkeley, ex-PM Asana/Cloudflare/Robinhood/Ancestry.

## Workspace navigation

Sibling repos under `~/liminal/`:

- **`~/liminal/founder-brain/`** — strategy, IP, content, full Liminal context. Start here for any non-code question.
- **`~/liminal/liminal-creative/`** — brand canon for any copy or visual work.
- **`~/liminal/liminal-desktop/`** — production desktop client (separate, private). The agentic OS architecture this plugin demonstrates is meant to live there at scale.
- **`~/liminal/hackathons/evermemos/`** — sister hackathon entry from a few days prior; conceptual overlap.
- **`~/liminal/liminal-space-v0/`** — pre-pivot product archive. Reference only.

## Build log + status

See README.md "Status" section. Day-by-day plan is in flight.
