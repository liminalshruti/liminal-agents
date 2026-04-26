# Demo recording — 60-second shooting script

**Submission:** AI Agent Economy Hackathon · Sat Apr 25 8 PM PT
**Recording target:** 6–7 PM PT
**Mode:** API mode (`ANTHROPIC_API_KEY` set). CLI shim is too slow for 60s.
**Tool:** asciinema → mp4, or screen recorder + tmux.

---

## The 60-second script

| Time | On screen | Voice-over |
|------|-----------|-----------|
| **0:00–0:08** | Empty terminal. Sigil ◇ ◆ ◇ on screen. | *"Founders pay agencies five hundred dollars a month for diligence prep, cold outreach, ship reviews. Most AI agents hallucinate when they're out of depth. Liminal Agents are bounded. Each one refuses work outside its lane."* |
| **0:08–0:25** | Type: `node bin/liminal-tui.js "competitive teardown of granola.ai"` · 3 panes render · Analyst: COMPLETE · SDR + Auditor: REFUSED with named redirects | *"Three agents respond to the same task. The Analyst produces the teardown. The SDR refuses — 'that's the Analyst's lane.' The Auditor refuses — 'I judge work, I don't produce it.' Refusal isn't a bug. Refusal is the feature."* |
| **0:25–0:42** | Type: `node bin/liminal-tui.js "draft a cold email to a16z about our Series A"` · 3 panes render · SDR: COMPLETE · Analyst + Auditor: REFUSED | *"Different task, different lane. The SDR drafts the email — under eighty words, one specific ask. The Analyst refuses. The Auditor refuses until you give it the draft to judge."* |
| **0:42–0:55** | Last TUI footer visible: `the record is the moat.` Optional: `node skills/history/history.js` | *"Every deliberation persists to a local SQLCipher-encrypted vault. Every correction is a first-party data category — the semantic delta between what the model said and what you actually want. The agents don't converge. The record does."* |
| **0:55–1:00** | Sigil + footer | *"Three bounded agents. Persistent vault. Agency-priced work."* |

**Word count:** ~155. Pacing: deliberate, not rushed.

---

## One-command setup

```bash
source scripts/demo.sh
```

Sets up temp vault, seeds it, exports env, prints the three demo commands. **Must `source`, not `bash`** (env vars need to stay in shell).

---

## Pre-flight (5 PM PT, 1 hour before recording)

- [ ] `source scripts/demo.sh` — confirm 5 signals seeded
- [ ] Dry-run each command once (cache model behavior, confirm timing)
- [ ] Terminal: font 18+, ~120 cols wide, dark theme
- [ ] `unset PROMPT_COMMAND` (no autocomplete noise)
- [ ] Test `granola.ai` reachable from recording machine; if not, fall back to `cursor.sh`

---

## Recording rules

1. **Type slowly.** Viewers can't follow fast typing.
2. **Pause after each pane appears.** Let the refusal vs. completion register.
3. **End on the footer.** `the record is the moat.` Pause 1s before cut.

---

## Backup plan

| Failure | Mitigation |
|---|---|
| API rate limit / network | Pre-record 3 runs as asciinema casts; play back if live fails |
| TUI breaks | Fall back to `node skills/agency/run.js "<task>"` (JSON output) |
| Single agent times out | Other two render; voice-over: "one is still working" |
| Wrong vault picked up | `unset LIMINAL_VAULT_DIR; export LIMINAL_VAULT_DIR=/tmp/lim-demo-recording` |
| `granola.ai` unreachable | Substitute `cursor.sh` (also public, well-known) |
| `perplexity.ai` requested | **Avoid** — Cloudflare bot detection blocks default UA |

---

## Voice-over alternates

**Tightest (20s):**
> Bounded agents. Three of them. The Analyst does research. The SDR runs outreach. The Auditor judges what ships. Each one refuses work outside its lane. Every correction goes into a local vault. The record is the moat.

**Investor-flavored (30s):**
> Founders pay agencies five hundred dollars a month for work AI should be able to do. The reason AI hasn't replaced them is hallucination. The Analyst makes things up; the SDR sends generic emails; nobody knows when the work is ready. We bounded the agents. Each refuses work outside its lane. Each correction goes into a local encrypted vault. The agents don't converge. The record does.

---

## Submission package (7–8 PM PT)

- [ ] 60-second video (mp4, 1080p)
- [ ] Public repo link: https://github.com/liminalshruti/liminal-agents
- [ ] One-paragraph submission summary (use README lead)
- [ ] Submit via AgentHansa per Luma blast

---

## Stretch demo for live Q&A (NOT for the 60s video)

If judges ask "what else?", the second-act run is **organizational coherence drift** — same three agents, different surface, expanding the wedge from "Liminal personal" to "Liminal team":

```bash
node bin/liminal-tui.js "read this 1:1 transcript and tell me if there's a coherence drift worth flagging"
```

(Requires Signal 6 from `scripts/seed-demo.js`. Voice-over: *"Same three agents. Different surface. Founders eventually hire teams. The same bounded-refusal architecture catches coherence drift in collaborators — the Snowden / Hansen problem at the seed. Three of these signals don't trigger anything. Five of them and the Auditor escalates."*)

Two of three memory-layer judges (Alex Newman, Nishkarsh Srivastava) host infrastructure this would run on. Don't lead with it — it's the surprise reveal.

---

## Why these specific runs

| Run | Why |
|---|---|
| Run 1 — `granola.ai` teardown | Granola is the meta-tool the judges are using to capture this hackathon's notes. Recognizable, well-known. Analyst produces structured 4-paragraph teardown grounded in fetched HTML, naming Series C + moat thesis + competitive splits. |
| Run 2 — `a16z cold email` | Universal startup vocabulary. SDR produces sub-80-word email, subject + 3 paragraphs + signature. ~5–8s in API mode. |
| Stretch — coherence drift | Wedge expansion to org-level memory. Resonates with memory-infra judges. Shows the architecture isn't single-use. |

**Avoid:** `perplexity.ai` (Cloudflare bot blocking).
**Backup:** `cursor.sh` if Granola unreachable.
