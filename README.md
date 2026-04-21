# Liminal Agents

> Three agents read your psychological state. They disagree. Your correction becomes data.

A Claude Code plugin built for the **Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon** (Apr 21–28, 2026). Ships a `/check` command that runs bounded multi-agent deliberation on the user's inner state.

## The thesis

Most AI products succeed when users accept the output. Liminal Agents succeeds when users push back.

Three agents with bounded psychological jurisdiction — **Architect**, **Witness**, **Contrarian** — read the same state and produce different interpretations. The user's correction of whichever one got it wrong becomes a novel data category: not preference signal like RLHF, but the semantic delta between "what the model said about me" and "what I experience."

The correction loop doesn't converge. Better AI deepens disagreements instead of eliminating them.

## Install

```bash
git clone https://github.com/liminalshruti/liminal-agents.git
cd liminal-agents
npm install
export ANTHROPIC_API_KEY=sk-...
claude --plugin-dir .
```

## Use

In Claude Code:

```
/liminal-agents:check
```

Or with optional context:

```
/liminal-agents:check I've been pushing hard on a launch this week
```

The plugin will:

1. Ask three forced-choice questions (attention / emotional register / time horizon)
2. Run three agents in parallel against your state
3. Surface their disagreement
4. Prompt you for which agent was wrong and why
5. Store the correction in a local SQLite vault at `~/.liminal-agents-vault.db`

## Architecture

```
liminal-agents/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   └── check/
│       ├── SKILL.md             # /check skill definition
│       ├── orchestrator.js      # Runs 3 agents via Opus 4.7
│       └── store-correction.js  # Stores user correction
├── package.json
└── README.md
```

### Bounded agents

Each agent has a **domain** and an **anti-domain** — topics they must engage with and topics they must refuse. Refusal is an output, not an error.

- **Architect** — structural pattern, system constraint. Anti-domain: felt experience.
- **Witness** — embodied signal, what is being held. Anti-domain: strategy.
- **Contrarian** — inversion, dangerous questions. Anti-domain: consensus.

### Vault schema

```sql
CREATE TABLE deliberations (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  user_state TEXT,
  user_context TEXT,
  q1 TEXT, q2 TEXT, q3 TEXT,
  architect_view TEXT,
  witness_view TEXT,
  contrarian_view TEXT,
  correction_agent TEXT,
  correction_reason TEXT,
  correction_timestamp INTEGER
);
```

The baseline is stored immediately. The correction is stored when the user responds. The delta is the product.

## Testing

Run the orchestrator directly (no Claude Code required):

```bash
npm run test:orchestrator
```

Inspect the vault:

```bash
npm run vault:show
```

## Status

Day-by-day build log:

- **Apr 21 (Mon) — Scaffold shipped.** Plugin manifest, SKILL.md, orchestrator, correction store, vault schema.
- **Apr 22 (Tue)** — Forced-choice flow polish; question sequencing.
- **Apr 23 (Wed)** — Agent prompt iteration on real state inputs.
- **Apr 24 (Thu)** — Deliberation logic: agents see each other's reads, produce disagreement notes.
- **Apr 25 (Fri)** — Correction UX + vault query utilities.
- **Apr 26 (Sat)** — Demo video (60s).
- **Apr 27 (Sun)** — Submission prep.
- **Apr 28 (Mon)** — **Ship.**

## License

MIT. See [LICENSE](./LICENSE).

## About

Built by the Liminal Space co-founding team:

- **Shruti Rajagopal** (CEO, full-time) · [theliminalspace.io](https://theliminalspace.io) · [Substack](https://liminalwoman.substack.com) · [X](https://x.com/ShrutiRajagopal)
- **Shayaun Nejad** (Co-founder, Engineering, part-time — continuing at Rubrik) · UC Berkeley · systems and security · OffSec-certified · CHI 2027 paper co-author

Part of [Liminal Space](https://theliminalspace.io) — a desktop workspace for founders, operators, and creatives at agentic scale. This plugin is the CLI surface of the agent architecture; the desktop app ships separately.
