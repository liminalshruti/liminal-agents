import { dropSnapshot } from "./orchestrator.js";

const DEMO_SNAPSHOTS = [
  {
    kind: "meeting",
    label: "1:1 with Maya",
    text: "Maya said the team is asking what we are doing about Eric. She used the word 'asking' twice. I deflected. She did not push.",
  },
  {
    kind: "decision",
    label: "Head of Eng offer postponed",
    text: "Postponed the head of eng offer for the third time. Told the candidate I needed another week. The reason I gave is not the real reason.",
  },
  {
    kind: "paste",
    label: "Sleep note",
    text: "Have not slept right in ten days. Wake up at 4am circling the same call.",
  },
  {
    kind: "meeting",
    label: "Standup",
    text: "Eric missed standup again. Maya covered. Nobody mentioned it. The room felt thin.",
  },
  {
    kind: "incident",
    label: "Customer X escalation",
    text: "Customer X escalated to me directly for the third week in a row. The same issue keeps coming back through a different door.",
  },
];

// Stagger the seeded snapshots earlier today so the vault scrolls in the order
// listed above (oldest first). Otherwise they all share Date.now() and SQLite
// returns them in undefined order.
const HOUR = 60 * 60 * 1000;
const STAGGER_OFFSETS_MS = [
  -8 * HOUR + 22 * 60 * 1000,    // ~9:48a (or wherever 8h+22m back lands)
  -6 * HOUR - 38 * 60 * 1000,    // ~11:22a
  -4 * HOUR - 52 * 60 * 1000,    // ~1:08p
  -3 * HOUR - 45 * 60 * 1000,    // ~2:15p
  -2 * HOUR - 18 * 60 * 1000,    // ~3:42p
];

export function seedDemoVault() {
  const seeded = [];
  // Newest-last in DEMO_SNAPSHOTS = newest-last in time. Map offsets accordingly.
  const reversed = [...DEMO_SNAPSHOTS].reverse();
  const now = Date.now();
  reversed.forEach((s, i) => {
    seeded.push(dropSnapshot({ ...s, timestamp: now + STAGGER_OFFSETS_MS[i] }));
  });
  return seeded;
}
