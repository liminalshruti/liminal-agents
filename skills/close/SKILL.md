---
name: close
description: End-of-day close. Synthesizes today's signals into one paragraph and up to three threads, runs Architect / Witness / Contrarian over the day, and captures the user's correction — tagged from the canonical taxonomy — to the vault.
disable-model-invocation: true
allowed-tools: Bash(node *)
argument-hint: "[optional: surfacing_id from daemon notification]"
---

# Liminal Agents — Close

The substrate has been ingesting all day. `/close` reads today's signals and runs the bounded agents over the synthesis. The correction loop is the same as `/check`: they disagree, you correct one, the record grows.

## Flow

### 1. Run the close script

If the user invoked `/close` from a daemon notification and $ARGUMENTS contains a surfacing_id, pass it along:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/close/close.js --surfacing-id=<uuid>
```

Otherwise:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/close/close.js
```

Returns JSON with `vault_id`, `signal_count`, `signal_summary`, up to three `threads`, and the three agent interpretations.

If `vault_id` is `null` and `reason` is `no_signals_today`, report that and stop.

### 2. Present the day

Show the user:

- **Today** — the `signal_summary` paragraph, verbatim.
- **Threads** — each thread's label and one-sentence summary.
- **Three reads** — Architect / Witness / Contrarian, labeled.

Then:

> "Which reading is wrong, and why? Your correction enters the vault."

### 3. Tag the correction

Map the user's reason to one of the nine canonical correction tags. See the /check skill for the full taxonomy: `wrong_frame`, `wrong_intensity`, `wrong_theory`, `right_but_useless`, `right_but_already_known`, `too_generic`, `missed_compensation`, `assumes_facts_not_in_evidence`, `off_by_layer`.

### 4. Store the correction

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/check/store-correction.js <vault_id> "<agent_name>" "<tag>" "<reason>"
```

Confirm and end the close.

## Voice rules

- No wellness framing. This is not a journal prompt. No "how was your day", no "what are you grateful for".
- Agents hold their jurisdictions. Do not paraphrase them into softer language.
- If the user says nothing landed today, write a correction with `too_generic` against whichever agent they single out.
