# OSS4AI Hackathon #32 — Demo Video Script

**Target:** 3:00 max. Aim for 2:45.
**Format:** Screen recording with voiceover. Shruti narrates.
**Hard cuts:** No fades, no music, no logo intro. Cold open.
**Show in browser tabs (set up before recording):**

1. Tab 1: GitHub README at https://github.com/liminalshruti/liminal-agents (scrolled to "The five buyers" section)
2. Tab 2: Terminal with `cd ~/liminal/liminal-agents/sandbox` open
3. Tab 3: A pre-rendered display of `/tmp/liminal-read.json` (or run live)

Optional: pre-warm the cache so the live read returns instantly.

```bash
LIMINAL_DB=/tmp/liminal-demo.db node bin/server.js &
sleep 2
curl -s -X POST http://localhost:3000/api/seed > /dev/null
curl -s -X POST http://localhost:3000/api/read -H 'Content-Type: application/json' -d '{}' > /tmp/liminal-read.json
# Now any subsequent /api/read returns instantly from cache (~120ms).
```

---

## Section 1 — Hook (0:00 – 0:25)

**On screen:** GitHub README, top of file. Show the ASCII diagram with 12 agents in 4 registers.

**Voiceover:**

> "Most AI agents hallucinate when out of depth. Liminal Agents are bounded — twelve specialists, four registers. Each refuses out of lane and names the right agent, by name.
>
> I'm Shruti Rajagopal. I'm building Liminal — a transition workspace for the moment before unfinished thought becomes a note, a task, or a decision. This is the agency surface."

---

## Section 2 — The five buyers (0:25 – 0:55)

**On screen:** Scroll to "The five buyers" table in README.

**Voiceover:**

> "Yesterday's hackathon judge gave us one piece of feedback: *pick the first five buyers, ship one specific deliverable for each.* These are the five.
>
> Solo founder mid-fundraise. Accelerator partner triaging datarooms. Pre-seed eng team lead. Solo SaaS operator. Compliance lead at a regulated startup. Each pays a small business between five hundred and ten thousand a month for what one specific subset of these twelve agents do.
>
> Same architecture, five deliverables, five buyers."

---

## Section 3 — The live demo (0:55 – 2:15)

**On screen:** Switch to terminal. Run:

```bash
curl -s -X POST http://localhost:3000/api/read \
     -H 'Content-Type: application/json' -d '{}' | jq
```

(Pre-warmed cache → returns in ~150ms. Pipe to `jq` for readable output.)

**Voiceover (while output renders):**

> "Here's a live read. Five snapshots — Customer X escalating, an engineer missing standups, a head-of-eng offer slipping for the third time, ten days of broken sleep. The synthesizer compresses it into one paragraph, three threads, then twelve agents fan out in parallel."

**Pause. Scroll through the JSON briefly. Then switch to README "What this looks like in practice" section to read the actual outputs.**

> "Watch what happens.
>
> *(Read aloud, scrolling)*
>
> The Auditor: 'NOT READY. All three threads share the same failure mode — the real conversation is being deferred while a surface version plays out. The blocker is not analysis; it is willingness to make the head-of-eng call.'
>
> The Strategist: 'Make the head-of-eng call this week. That single unblock removes the sleep tax, which is what's letting Eric's pattern and Customer X's recurrence rot for another cycle.'
>
> The Skeptic: 'If the obvious reading is wrong, the customer isn't escalating because of a bug — the relationship has decayed and any defect now reads as proof. Eric isn't avoiding performance; the head of eng IS the avoidance.'
>
> Three different reads. The disagreement is the product."

---

## Section 4 — Refusal-as-feature (2:15 – 2:40)

**On screen:** Scroll to the SDR / Closer / Operator / Scheduler / Bookkeeper refusals in the same demo output.

**Voiceover:**

> "And five of twelve refused.
>
> The SDR: 'REFUSE: Closer. SDR writes cold-open outreach to new contacts. This is internal escalation triage, not a first-touch message.'
>
> The Operator: 'REFUSE: Strategist. Three unresolved threads need a decision on which to act first. Operator only sequences after that call is made.'
>
> When you ask the wrong agent, you don't get a worse answer — you get a clean redirect, by name. Refusal is the feature. The vault keeps the record. The correction stream is the moat."

---

## Section 5 — Close (2:40 – 3:00)

**On screen:** GitHub repo URL + LICENSE banner + final ASCII diagram.

**Voiceover:**

> "Twelve agents. Four registers. Local-first SQLite vault. MIT license. Built on Anthropic's Claude Opus 4.7.
>
> Repo: github.com/liminalshruti/liminal-agents.
>
> Liminal gives form to inner life."

---

## Recording notes

- **Pacing:** Spoken naturally this is ~340 words = ~2:20 at conversational pace. Leaves slack for screen scrolls + the terminal command running.
- **Mic:** Use whatever's quietest. AirPods Pro are fine.
- **No retakes per section.** If something fumbles, keep going. Cut once at the end.
- **Tone:** Senior-IC matter-of-fact. No "in this video..." No "today I want to show you..." No marketing voice. The product speaks for itself.
- **Banned words:** transformation, journey, companion, unlock, manifest, healing, optimize, breakthrough, flourishing, wellness, emotional intelligence, empathic.

## Upload

- YouTube unlisted OR Google Drive public link (per form)
- Filename: `liminal-agents-oss4ai-32-demo.mp4`
- Description: "Liminal Agents — OSS4AI Hackathon #32 submission. Twelve bounded specialists in four registers. Each refuses out of lane and names the right agent. github.com/liminalshruti/liminal-agents"

## Submission form

https://forms.gle/sks1qvad7LeAKA5TA

- **Team Name:** Liminal Space (or Liminal Agents)
- **Project Name:** Liminal Agents
- **Video link:** [your YouTube unlisted / Drive link]
- **GitHub link:** https://github.com/liminalshruti/liminal-agents
- **Slides:** (skip if time-constrained)
- **Team Member 1:** Shruti Rajagopal · [your LinkedIn]
- **Team Member 2 (optional):** Shayaun Nejad · [Sean's LinkedIn]
