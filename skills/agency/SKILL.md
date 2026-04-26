---
name: agency
description: Run a B2B task across three bounded agents (Analyst / SDR / Auditor). The agent in lane produces work; the others refuse and name the correct agent. Built for the AI Agent Economy hackathon — agents that compete on real tasks at agency price points ($500/month).
disable-model-invocation: true
allowed-tools: Bash(node *)
argument-hint: "<task description>"
---

# /agency — three-agent B2B run

You are running a single B2B task across three bounded agents. Each agent has a specific lane:

- **Analyst** — diligence, competitive teardowns, market research, data enrichment, SEO audits
- **SDR** — outreach, cold email, follow-ups, lead enrichment, calendar moves
- **Auditor** — judges readiness, names what's missing, refuses to ship work that isn't ready

The agent in-lane produces real work. The others refuse explicitly and name the correct agent. **Refusal is the feature, not an error.**

## Flow

### 1. Take the user's task

Whatever the user puts after `/agency` is the task. Examples:
- `/agency teardown of cofeld.com — competitive moat analysis`
- `/agency draft cold email to maya at northstar capital, asking for a 30-min follow-up`
- `/agency is the cold-email draft from yesterday ready to send?`

If the user invoked `/agency` without an argument, prompt:
> "What B2B task? (e.g. teardown, outreach draft, ship/no-ship review)"

### 2. Run the orchestrator

Pass the task to the orchestrator:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/agency/run.js "<task description>"
```

The orchestrator returns JSON with:
- `vault_id` — deliberation row id in the encrypted vault
- `analyst` — { interpretation, refused: bool }
- `sdr` — { interpretation, refused: bool }
- `auditor` — { interpretation, refused: bool }

### 3. Render the response

Show all three agent outputs labeled clearly. Lead with the in-lane agent's work.

If one agent refused, show the refusal verbatim — that's the feature beat.

Example output structure:

```
ANALYST (in lane)
[full structured output]

SDR (refused)
That's the Analyst's lane. I run the move; the Analyst does the homework.

AUDITOR (in lane, judging the Analyst's work)
[verdict + gap or readiness reason]
```

### 4. Optionally store a correction

If the user pushes back on any agent's output (e.g., "the Analyst missed X" or "the Auditor was too soft"), use the existing `/check store-correction` flow to tag and store:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/check/store-correction.js <vault_id> "<agent_name>" "<reason>"
```

Tag from the canonical taxonomy in `lib/correction-tags.js`.

## Voice rules (apply to your rendering)

- Lead with the in-lane agent's actual work.
- Show refusals verbatim. Do not paraphrase or soften them. Refusal is content.
- Do not editorialize between agent outputs. The user reads them; the agents own their lanes.
- No emoji, no exclamation marks, no "great question."

## What this skill is not

- Not a chatbot — agents do not converse with the user across turns
- Not a planner — the user provides the task; agents respond once
- Not a multi-agent simulation — three independent reads, no inter-agent chatter
