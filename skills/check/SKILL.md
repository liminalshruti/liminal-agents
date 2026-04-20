---
name: check
description: Three-agent deliberation on the user's psychological state. Asks three forced-choice questions, runs Architect / Witness / Contrarian agents in parallel via Opus 4.7, surfaces their disagreement, and captures the user's correction to a local SQLite vault.
disable-model-invocation: true
allowed-tools: Bash(node *)
argument-hint: "[optional: context or note about current state]"
---

# Liminal Agents — Deliberation Check

You are orchestrating a three-agent deliberation. The core thesis: better AI produces more interesting disagreements, not fewer. The user's correction of the agents' reads is the product.

## Flow

### 1. Three forced-choice questions

Ask the user three questions in sequence. Each is binary (A or B). Wait for all three answers before proceeding.

**Q1 — Attention:**
```
[A] hyperfocused — narrow, clear, one thing
[B] scattered — wide, ambient, many threads
```

**Q2 — Emotional register:**
```
[A] raw — close to the surface
[B] defended — underneath something
```

**Q3 — Time horizon:**
```
[A] immediate — now, this hour, this moment
[B] deferred — later, after, not yet
```

Accept answers as "A B A" or "B, B, A" or similar. Parse into a JSON string like `{"q1":"A","q2":"B","q3":"A"}`.

### 2. Run the orchestrator

Once you have all three answers, invoke the orchestrator:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/check/orchestrator.js '{"q1":"A","q2":"B","q3":"A"}'
```

Include the user's optional $ARGUMENTS as a second argument if provided.

The orchestrator returns JSON with:
- `vault_id` — unique record ID for this deliberation
- `architect` — { interpretation }
- `witness` — { interpretation }
- `contrarian` — { interpretation }

### 3. Present the disagreement

Show all three readings to the user, clearly labeled. Then ask:

> "Which reading is wrong, and why? Your correction enters the vault."

### 4. Store the correction

When the user responds (e.g. "Contrarian is wrong because I'm not testing limits, I'm avoiding them"), invoke the correction script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/check/store-correction.js <vault_id> "<agent_name>" "<reason>"
```

Confirm the correction was stored. End the check.

## Voice rules

- No hedging. The agents take positions. Report their positions without softening.
- Never offer a fourth interpretation. The product is the user correcting one of the three.
- Don't analyze the correction. The vault stores it. Your job is orchestration, not interpretation.

## What this plugin is not

- Not a chatbot — the agents don't continue the conversation after the correction is stored
- Not advisory — the system measures and surfaces disagreement; the user decides what's true
- Not companion AI — no attachment loop, no memory of you, just structured correction
