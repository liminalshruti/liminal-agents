#!/usr/bin/env node
/**
 * Demo seed — populates a fresh vault with synthetic, non-personal content for
 * the Apr 25 Cerebral Valley × Anthropic hackathon demo recording.
 *
 * Why this exists:
 *   The daemon ingests from the user's real Granola cache, which contains
 *   commingled personal + operational content (see SPEC §4.2). Recording the
 *   demo against a real vault would surface real meeting transcripts. This
 *   script writes a curated synthetic vault tied to a temp LIMINAL_VAULT_DIR
 *   so the recording is reproducible and contains zero personal content.
 *
 * Usage:
 *   LIMINAL_VAULT_DIR=$(mktemp -d) LIMINAL_VAULT_KEY=$(node -e \
 *     "console.log(require('crypto').randomBytes(32).toString('hex'))") \
 *     node scripts/seed-demo.js
 *
 *   Then run the demo skills against the same LIMINAL_VAULT_DIR.
 *
 * Demo flow (per SPEC §7, Apr 25 22:14 reframe):
 *   1. Contrarian refuses outreach request, names Operator
 *   2. Strategist produces a competitive teardown
 *   3. Operator drafts an outreach email referencing the teardown
 *   4. /history shows the deliberations + refusal
 *
 * The synthetic content is realistic founder-operator data — meetings, notes,
 * git commits, Apple Reminders — but every name, company, and detail is
 * fictional. Safe to include in screen recordings.
 */

import { openVault } from "../lib/vault/db.js";
import { newId } from "../lib/vault/ids.js";

const db = openVault();
const NOW = Date.now();
const HOUR = 60 * 60 * 1000;

// === SIGNAL 1: Granola — yesterday's investor call (the Strategist will use this) ===
const granolaInvestorCall = {
  doc_id: "synthetic-doc-001",
  title: "Coffee with Maya at Northstar Capital",
  notes: [
    "Maya leads early-stage at Northstar — just closed Fund III, $180M, focused on infra + tools-for-thought.",
    "She's been tracking three companies in the agentic-workspace space:",
    "  - Cofeld (YC W24) — multi-agent orchestration for finance teams. Series A May 2025, $12M from Kleiner. Strong traction in mid-market accounting firms.",
    "  - Threadline (a16z Speedrun S25) — ambient capture across Granola/Notion/Linear, 'the layer underneath your tools.' Still pre-seed, building in public.",
    "  - Bolt Frame — closed beta, ex-Linear team, $4M pre-seed from Sequoia Scout. Pitching as 'the OS for solo founders running 10 agents at once.'",
    "Maya's open question: which of these has actual moat vs. which is a feature Anthropic ships in Q3?",
    "She'd write a check at $4M post if the moat story is sharp. Wants to see the wedge customer not the platform play.",
  ].join("\n"),
  summary: "Investor coffee. Maya at Northstar Capital reviewing competitors in agentic-workspace category. Asked for sharp moat differentiation vs. potential Anthropic native features.",
  transcript_excerpt:
    "MAYA: So look, I love what you're doing in concept, but I've heard versions of this from three companies this quarter. Cofeld closed in May. Threadline's in Speedrun. Bolt Frame just took a Sequoia Scout check. What I need from you is the answer to 'why doesn't Anthropic just ship this in Claude Code in Q3.' If that answer is structural — schema, refusal, something that takes a year to copy — I write a check. If it's a feature gap, I'm out.",
  text: "Meeting: Coffee with Maya at Northstar Capital\nMaya at Northstar tracking Cofeld, Threadline, Bolt Frame. Wants moat-vs-feature answer.",
  has_transcript: true,
  transcript_length: 2400,
  people_count: 2,
  created_at: new Date(NOW - 24 * HOUR).toISOString(),
  updated_at: new Date(NOW - 22 * HOUR).toISOString(),
};

// === SIGNAL 2: Obsidian — earlier teardown notes on competitor (Strategist context) ===
const obsidianCompetitorNotes = {
  source_path: "research/competitors/cofeld-teardown-draft.md",
  text: [
    "# Cofeld teardown — first pass (Tuesday)",
    "",
    "## Product",
    "- Multi-agent orchestration for accounting workflows",
    "- 4 named agents: Reconciler, Auditor, Reporter, Compliance",
    "- Agents 'collaborate' on month-close — outputs piped agent-to-agent",
    "- Pricing: $499/seat/mo, min 3 seats. So $18K ARR/customer floor.",
    "",
    "## Strengths",
    "- Real wedge: month-close is painful, expensive, has clear ROI",
    "- Strong founder — ex-Plaid VP eng, raised on personal network",
    "- Customers: 12 mid-market firms cited in Series A press",
    "",
    "## Weaknesses",
    "- Agents don't actually refuse out-of-domain — Reconciler will happily try to write SOX-compliance memos when asked",
    "- No persistent vault. Each session is fresh. Customer feedback loop is via support tickets, not in-product correction.",
    "- Pricing won't scale to solo founder ICP. Missing the bottom of the market.",
    "",
    "## Open question",
    "Is Cofeld a competitor or a customer? Their backend may need our refusal layer.",
  ].join("\n"),
  created_at: new Date(NOW - 3 * 24 * HOUR).toISOString(),
  updated_at: new Date(NOW - 3 * 24 * HOUR).toISOString(),
};

// === SIGNAL 3: Apple Reminders — current week's todos (Operator context) ===
const remindersList = {
  list_name: "Liminal — week of Apr 21",
  items: [
    { text: "Send Maya at Northstar a follow-up — the moat question", due: new Date(NOW + 6 * HOUR).toISOString(), completed: false },
    { text: "Reply to Threadline founder DM (mutual intro from Karen)", due: new Date(NOW + 8 * HOUR).toISOString(), completed: false },
    { text: "Finish Cofeld teardown — sharpen weakness section", due: new Date(NOW + 12 * HOUR).toISOString(), completed: false },
    { text: "Sched: 30 min with Bolt Frame eng next week", due: new Date(NOW + 3 * 24 * HOUR).toISOString(), completed: false },
    { text: "Substack post: 'why agents that refuse beat agents that don't'", due: new Date(NOW + 4 * 24 * HOUR).toISOString(), completed: false },
  ],
  text: "Reminders list: Liminal week of Apr 21 — 5 open items including Maya follow-up, Threadline reply, Cofeld teardown finalize.",
  created_at: new Date(NOW - 4 * 24 * HOUR).toISOString(),
  updated_at: new Date(NOW - 2 * HOUR).toISOString(),
};

// === SIGNAL 4: Claude Code — recent user message about the same investor (substrate proof) ===
const claudeCodeMessage = {
  project: "liminal-agents",
  file: "session-2026-04-24.jsonl",
  text: "draft an email to maya at northstar — she asked for the moat answer in our coffee yesterday. needs to land the difference between us and cofeld + threadline",
  ts: NOW - 5 * HOUR,
};

// === SIGNAL 5: git — recent commit (substrate proof, low-noise) ===
const gitCommit = {
  repo: "/Users/demo/liminal-agents",
  sha: "8a1c2f9",
  author: "demo-user",
  subject: "feat: bounded refusal in agent system prompts",
};

// === SIGNAL 6: Granola — team coherence drift signal (advanced demo beat) ===
// Demonstrates the wedge expansion the Apr 25 hackathon strategy meeting named:
// "Liminal personal" → "Liminal team" → coherence drift detection. The agents
// can read this and the Auditor can flag the drift. Not for the 60-sec video,
// but available for the live Q&A or stretch demo if judges ask "what else?"
const granolaTeamMeeting = {
  doc_id: "synthetic-doc-006",
  title: "Weekly 1:1 — Jordan (eng contractor)",
  notes: [
    "Jordan, 4 weeks into 6-month engineering contract on the agentic-OS pipeline.",
    "Stated goal in onboarding: ship the daemon ingestion layer by week 8. Was excited about the bounded-agent architecture.",
    "This week's signals are diverging from that:",
    "  - Standup updates are 1-line, no detail. Last 3 weeks running.",
    "  - Slack activity dropped to <5 messages/day from ~25/day in week 1-2.",
    "  - PR descriptions stopped including 'why' — just 'what' (was including both).",
    "  - Said in 1:1: 'I have some side projects I'm exploring' — when I asked which, was vague.",
    "  - Asked for read access to repos outside the contract scope. Said 'just curious about the architecture.' Granted but flagged.",
    "Cross-thread: the architecture docs Jordan asked about are the IP we're filing PPAs on next week. Timing is unusual.",
    "No evidence of bad intent. Just signal divergence between stated commitment and observed behavior.",
    "Need: structured read of whether this is a coherence drift worth flagging, or normal end-of-onboarding cooling, or my own paranoia.",
  ].join("\n"),
  summary: "Weekly 1:1 with engineering contractor showing 3-week pattern of disengagement signals + an unusual repo-access request adjacent to pre-filing IP.",
  transcript_excerpt:
    "ME: How's the daemon work going? JORDAN: Yeah, good. Making progress. ME: What's blocking? JORDAN: Nothing really. ME: I noticed your PR descriptions got shorter — anything I should know? JORDAN: Just trying to move faster. ME: Okay. Anything else on your mind? JORDAN: I've been exploring some side projects. ME: Which ones? JORDAN: Just stuff. Architecture-curious things. ME: Including in our codebase? JORDAN: I asked for read access to a few repos. Just to learn the architecture better. ME: Specifically? JORDAN: The agent stuff and the substrate layer. (long pause) ME: Okay.",
  text: "Meeting: Weekly 1:1 — Jordan (eng contractor)\n3-week disengagement pattern + repo-access request adjacent to pre-filing IP. Need structured read.",
  has_transcript: true,
  transcript_length: 1800,
  people_count: 2,
  created_at: new Date(NOW - 6 * HOUR).toISOString(),
  updated_at: new Date(NOW - 4 * HOUR).toISOString(),
};

// ---- write everything ----

const insertSignal = db.prepare(`
  INSERT INTO signal_events (id, timestamp, source, kind, register, thread_id, content, schema_version, vault_origin)
  VALUES (?, ?, ?, ?, ?, NULL, ?, 1, 'native')
`);

const written = [];

// Granola
const granolaId = newId();
insertSignal.run(
  granolaId,
  new Date(granolaInvestorCall.updated_at).getTime(),
  "granola",
  "meeting",
  "operational",
  JSON.stringify(granolaInvestorCall),
);
written.push({ id: granolaId, source: "granola", title: granolaInvestorCall.title });

// Obsidian (synthetic — Obsidian source isn't implemented yet, but the schema accepts it)
const obsidianId = newId();
insertSignal.run(
  obsidianId,
  new Date(obsidianCompetitorNotes.updated_at).getTime(),
  "obsidian",
  "note",
  "operational",
  JSON.stringify(obsidianCompetitorNotes),
);
written.push({ id: obsidianId, source: "obsidian", title: obsidianCompetitorNotes.source_path });

// Apple Reminders (synthetic source — not in current enum, but seeding for forward-compat)
// NOTE: if SPEC §6 integrity constraints land before recording, this will need
// 'apple_reminders' added to the source CHECK constraint or this insert will fail.
// For now (Apr 25), source is plain TEXT.
const remindersId = newId();
try {
  insertSignal.run(
    remindersId,
    new Date(remindersList.updated_at).getTime(),
    "apple_reminders",
    "list_snapshot",
    "operational",
    JSON.stringify(remindersList),
  );
  written.push({ id: remindersId, source: "apple_reminders", title: remindersList.list_name });
} catch (err) {
  console.warn(`apple_reminders insert failed (likely CHECK constraint): ${err.message}`);
  console.warn("→ skipping; Reminders surface in demo will be empty. Strategist + Operator still work.");
}

// Claude Code
const ccId = newId();
insertSignal.run(
  ccId,
  claudeCodeMessage.ts,
  "claude-code",
  "user_message",
  "inner",
  JSON.stringify({
    project: claudeCodeMessage.project,
    file: claudeCodeMessage.file,
    text: claudeCodeMessage.text,
  }),
);
written.push({ id: ccId, source: "claude-code", title: "user_message" });

// git
const gitId = newId();
insertSignal.run(
  gitId,
  NOW - 7 * HOUR,
  "git",
  "commit",
  "operational",
  JSON.stringify(gitCommit),
);
written.push({ id: gitId, source: "git", title: gitCommit.subject });

// Granola — team coherence drift signal
const teamId = newId();
insertSignal.run(
  teamId,
  new Date(granolaTeamMeeting.updated_at).getTime(),
  "granola",
  "meeting",
  "operational",
  JSON.stringify(granolaTeamMeeting),
);
written.push({ id: teamId, source: "granola", title: granolaTeamMeeting.title });

// ---- summary ----

const total = db.prepare("SELECT COUNT(*) AS c FROM signal_events").get().c;
const bySource = db
  .prepare("SELECT source, COUNT(*) AS c FROM signal_events GROUP BY source ORDER BY source")
  .all();

db.close();

console.log(
  JSON.stringify(
    {
      seeded: written.length,
      total_in_vault: total,
      by_source: bySource,
      written,
      demo_ready: total >= 4,
      next_steps: [
        "Confirm: LIMINAL_VAULT_DIR is a fresh temp dir (not the real ~/Library/Application Support/Liminal)",
        "Run /diligence or /teardown skill against this seeded vault for the demo",
        "Verify: agents see investor-call meeting + competitor notes when synthesizing",
      ],
    },
    null,
    2,
  ),
);
