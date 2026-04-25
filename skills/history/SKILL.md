---
name: history
description: Read-only view of the vault. Prints the landed-vs-corrected matrix per agent and a breakdown of correction tags across all deliberations. Writes nothing.
disable-model-invocation: true
allowed-tools: Bash(node *)
argument-hint: "[optional: --since-days=N]"
---

# Liminal Agents — History

Read-only. The record is the moat. This skill reads it and shows the shape of disagreement over time.

## Flow

Run the history script. If $ARGUMENTS contains `--since-days=N`, pass it along.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/history/history.js
```

Or:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/history/history.js --since-days=30
```

Returns JSON with:
- `deliberations` — total count in window
- `corrections` — total correction count in window
- `legacy_imported` — count of legacy-import rows (pre-substrate v0.2)
- `matrix` — per agent: `landed`, `corrected`, `by_tag` (counts by canonical tag)
- `note` — the structural claim: the agents do not converge; the record does

## Present

Show the matrix as a table. Do not editorialize. Do not average. Do not suggest improvements. The user reads their own pattern.

If the user asks "what does this mean", state the claim once: **the agents do not adapt. The record does. What they miss, and how you tag what they miss, is the data.**

## What this skill is not

- Not a dashboard. No charts, no graphs.
- Not advisory. No recommendations to "work with" a particular agent more often.
- Not a convergence signal. Increasing correction rates are not a problem to solve.
