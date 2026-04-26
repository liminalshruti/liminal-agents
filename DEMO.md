# Demo recording — 60-second video script

**Submission:** AI Agent Economy Hackathon, Topify AI / AgentHansa, Sat Apr 25 8 PM PT.
**Recording target:** 6–7 PM PT same day.
**Tool:** asciinema for the terminal capture, then convert to mp4 (or screen recorder + tmux).
**Mode:** API mode (`ANTHROPIC_API_KEY` set). CLI shim is too slow for a 60s video.

---

## Pre-flight checklist (Sat 5–6 PM PT)

- [ ] `export ANTHROPIC_API_KEY=sk-ant-api03-...`
- [ ] `export LIMINAL_VAULT_DIR=/tmp/lim-demo-recording` (fresh dir, NOT real vault)
- [ ] `export LIMINAL_VAULT_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`
- [ ] `node scripts/seed-demo.js` — confirm 5 signals seeded
- [ ] Run each TUI invocation once as a dry-run (cache the model behavior, confirm timing)
- [ ] Clear terminal, set comfortable font size for screen recording
- [ ] Open tmux session: `tmux new -s demo`

---

## Voice-over script (60 seconds, ~150 words)

**(0:00–0:08) Open — the agency-priced framing**

> Founders pay agencies five hundred dollars a month for diligence prep, cold outreach, ship reviews. Most AI agents hallucinate when they're out of depth. Liminal Agents are bounded. Each one refuses work outside its lane.

**(0:08–0:25) Beat 1 — Analyst in lane, others refuse**

[On screen: type `node bin/liminal-tui.js "competitive teardown of perplexity.ai"`]

> Three agents respond to the same task. The Analyst produces the teardown.

[Wait ~5–8s for response. Three panes render.]

> The SDR refuses — "that's the Analyst's lane." The Auditor refuses — "I judge work, I don't produce it." Refusal isn't a bug. Refusal is the feature.

**(0:25–0:42) Beat 2 — different lane, different in-lane agent**

[On screen: type `node bin/liminal-tui.js "draft a cold email to a16z about our Series A"`]

> Different task, different lane. The SDR drafts the email — under eighty words, one specific ask. The Analyst refuses. The Auditor refuses *until you give it the draft to judge*.

**(0:42–0:55) Beat 3 — the vault is the moat**

[On screen: `node skills/history/history.js` or scroll to footer of last TUI: "vault: deliberation [...] stored. /history shows the record."]

> Every deliberation persists to a local SQLCipher-encrypted vault. Every correction you make is a first-party data category — the semantic delta between what the model said and what you actually want. The agents don't converge. The record does.

**(0:55–1:00) Close**

> Three bounded agents. Persistent vault. Agency-priced work.

---

## Demo runs (in order)

### Run 1 — Analyst in lane

**Command:**
```bash
node bin/liminal-tui.js "competitive teardown of perplexity.ai"
```

**Why this task:** Perplexity is a real, public, well-known company. Model has good context. Analyst will produce a structured teardown with named comparables (e.g., Google, Anthropic, You.com, Brave, Kagi). Response time ~5–8s in API mode.

**Expected:**
- Analyst → COMPLETE, 3-4 paragraph structured teardown
- SDR → REFUSED, "That's the Analyst's lane"
- Auditor → REFUSED, "I judge work; I don't produce teardowns"

### Run 2 — SDR in lane

**Command:**
```bash
node bin/liminal-tui.js "draft a cold email to a16z about our Series A"
```

**Why this task:** Universal startup vocabulary. SDR will produce an email under 80 words with subject + 3-paragraph body + signature. Response time ~5–8s in API mode.

**Expected:**
- Analyst → REFUSED, "That's the SDR's lane"
- SDR → COMPLETE, structured cold email
- Auditor → REFUSED, possibly with the upstream-gap-naming pattern

### Run 3 (optional, if pacing allows) — Auditor in lane

**Command:**
```bash
node bin/liminal-tui.js "is this email ready to send: 'Maya - moat question. Worth a 4-min sync?'"
```

**Why this task:** Concrete artifact for the Auditor to judge. Auditor will produce a verdict ("not ready") and name the specific gap. Response time ~3–6s in API mode.

**Expected:**
- Analyst → REFUSED, "That's the Auditor's call"
- SDR → REFUSED, "the Auditor decides whether it ships"
- Auditor → COMPLETE, verdict + specific gap

---

## Backup plan if something fails on stage

| Failure | Mitigation |
|---|---|
| API rate limit / network | Pre-record 3 runs as asciinema casts; play back if live demo fails |
| TUI breaks on the recording machine | Fall back to `node skills/agency/run.js "<task>"` and show JSON output |
| Single agent times out | The other two still render; voice-over notes "one of them is still working" |
| Wrong vault picked up | `unset LIMINAL_VAULT_DIR` and `export LIMINAL_VAULT_DIR=/tmp/lim-demo-recording` |

---

## Recording tips

1. **Font size 18+** in the terminal so judges can read the agent output.
2. **Wide terminal** (~120 columns) so the TUI doesn't wrap awkwardly.
3. **Dark background** (default Terminal.app or iTerm dark theme). The TUI's color codes assume dark.
4. **No bell, no autocomplete suggestions** — clean shell. `unset PROMPT_COMMAND` if needed.
5. **Type slowly** during the recording; viewers can't follow fast typing.
6. **Pause after each agent pane appears** — let the judge see the refusal vs. completion.
7. **End on the footer**: `the record is the moat.` Pause 1s before cutting.

---

## Submission package (Sat 7–8 PM PT)

- [ ] 60-second video (mp4, 1080p)
- [ ] Public GitHub repo link: https://github.com/liminalshruti/liminal-agents
- [ ] One-paragraph submission summary using the README's lead
- [ ] Submit via AgentHansa per Luma blast instructions

---

## Voice-over alternatives (~20-30s versions if needed)

**Tightest (20s):**
> Bounded agents. Three of them. The Analyst does research. The SDR runs outreach. The Auditor judges what ships. Each one refuses work outside its lane. Every correction goes into a local vault. The record is the moat.

**Investor-flavored (30s):**
> Founders pay agencies five hundred dollars a month for work that AI should be able to do. The reason AI hasn't replaced them is hallucination. The Analyst makes things up; the SDR sends generic emails; nobody knows when the work is ready. We bounded the agents. Each one refuses work outside its lane. Each correction goes into a local encrypted vault. The agents don't converge. The record does.
