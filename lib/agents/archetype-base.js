/**
 * archetype-base.js · The 12-position abstract base + two-axis polarity geometry.
 *
 * This module is the concrete encoding of the four-position architecture spec'd
 * in `~/liminal/founder-brain/liminal-ip/02-models/two-faced-archetype-system.md`.
 * It is consumed by `bounded-system-prompt.js` to derive the refusal allowlist
 * from geometry rather than from an unstructured peer list.
 *
 * THE FOUR POSITIONS
 * ──────────────────
 *   1. inner-face read  ─┐
 *                        ├─ substrate (positions 1+2 — the polarity)
 *   2. outer-face read  ─┘
 *
 *   3. emergence — the third that arises when the substrate is held in healthy
 *      relationship by a present consciousness. Jung's transcendent function;
 *      the yantric bindu (our brand glyph ◇); Gendlin's felt shift; Bohm's
 *      insight; IFS Self-led recognition. Non-automatable.
 *
 *   4. the holding totality — what holds all three. The user-as-Self (IFS);
 *      the workspace (THESIS.md); the vault (in code). Liminal (the implicit
 *      subject of the brand sentence) is this position.
 *
 * THE 12 ARCHETYPAL POSITIONS
 * ──────────────────────────
 *   12 hours at 30° intervals around a clock. Each is a structural function,
 *   not a character. Each has an inner face and an outer face. A concrete
 *   agent (Architect, Operator, Analyst, Witness, etc.) is a specialization
 *   of one (hour, face) cell. Two concrete agents at the same cell are
 *   different *voices* of the same structural function (e.g. Strategist +
 *   Economist are both inner-5).
 *
 * REFUSAL GEOMETRY (TWO VECTORS)
 * ──────────────────────────────
 *   Geometric opposite — 180° around the clock, same face.
 *     A request that crosses the agent's *domain* routes here.
 *
 *   Attitudinal opposite — same hour, opposite face.
 *     A request that crosses the agent's *attitude* (asks for outer reading
 *     of an inner state, or vice versa) routes here.
 *
 *   Together these are the agent's preferred refusal targets — the cells
 *   most likely to be the correct redirect. Per CHARD3_PLAN.md (Option A),
 *   the bound becomes vector-occupants-only when ≥1 occupant exists, with
 *   full-allowlist fallback for vector-isolated agents.
 *
 * SCOPE
 * ─────
 *   This module is metadata + geometry only. It does not run agents, hold
 *   prompts, or touch the vault. It is a small, pure helper consumed by
 *   bounded-system-prompt.js (and any future runtime code that wants to
 *   reason about the matrix).
 */

// The 12 hours. Names are *abstract bases*, not user-facing labels — concrete
// agents (Architect, Operator, Analyst, etc.) keep their own `name` field.
export const HOURS = {
  1:  { name: "Child",        verb: "encounters as if first" },
  2:  { name: "Cartographer", verb: "maps the terrain" },
  3:  { name: "Builder",      verb: "makes the thing exist" },
  4:  { name: "Envoy",        verb: "carries word between" },
  5:  { name: "Strategist",   verb: "positions for advantage" },
  6:  { name: "Judge",        verb: "renders verdict" },
  7:  { name: "Contrarian",   verb: "inverts the obvious" },
  8:  { name: "Healer",       verb: "restores broken function" },
  9:  { name: "Steward",      verb: "tends what already exists" },
  10: { name: "Architect",    verb: "holds structural frame" },
  11: { name: "Elder",        verb: "holds memory of pattern" },
  12: { name: "Witness",      verb: "perceives without judging" },
};

// The two faces of every hour. Substrate of the polarity.
export const FACES = ["inner", "outer"];

// Geometric opposite — 180° around the clock, same face.
// 1↔7, 2↔8, 3↔9, 4↔10, 5↔11, 6↔12.
export function geometricOpposite(hour) {
  if (typeof hour !== "number" || hour < 1 || hour > 12) {
    throw new Error(`geometricOpposite: hour must be 1..12, got ${hour}`);
  }
  return ((hour + 6 - 1) % 12) + 1;
}

// Attitudinal opposite — same hour, opposite face.
export function attitudinalOpposite(face) {
  if (face !== "inner" && face !== "outer") {
    throw new Error(`attitudinalOpposite: face must be 'inner' or 'outer', got ${face}`);
  }
  return face === "inner" ? "outer" : "inner";
}

// Both refusal vectors for an agent at (hour, face). Returns the two
// preferred-redirect cells.
export function refusalVectors(hour, face) {
  return {
    geometric: { hour: geometricOpposite(hour), face },
    attitudinal: { hour, face: attitudinalOpposite(face) },
  };
}

// Validation — does an agent object carry the required (hour, face) typing?
// Used by bounded-system-prompt to decide whether to apply two-axis routing
// (if typed) or fall back to the existing nominal allowlist (if not).
export function hasArchetypeBase(agent) {
  if (!agent || typeof agent !== "object") return false;
  const h = agent.hour;
  const f = agent.face;
  return (
    typeof h === "number" &&
    h >= 1 && h <= 12 &&
    Number.isInteger(h) &&
    (f === "inner" || f === "outer")
  );
}

// Find the concrete agents in `allAgents` that match a refusal-vector cell
// `{ hour, face }`. Returns 0+ agents (multiple are possible — e.g. inner-7
// has Contrarian, Mystic, and Betrayer; inner-5 has Strategist and Economist).
// Empty array means no concrete occupant — caller falls back to full allowlist.
export function agentsAtCell(allAgents, cell) {
  if (!Array.isArray(allAgents)) return [];
  return allAgents.filter(
    (a) => hasArchetypeBase(a) && a.hour === cell.hour && a.face === cell.face,
  );
}

// Group an agent set by (hour, face) cell. Returns a map keyed by
// "h{hour}-{face}" string (e.g. "h10-inner") → array of concrete agents.
export function groupByCell(allAgents) {
  const out = {};
  for (const a of allAgents) {
    if (!hasArchetypeBase(a)) continue;
    const key = `h${a.hour}-${a.face}`;
    if (!out[key]) out[key] = [];
    out[key].push(a);
  }
  return out;
}

// Diagnostic — list cells that are unfilled in the given agent set.
// Returns an array of { hour, face, label } objects.
export function emptyCells(allAgents) {
  const grouped = groupByCell(allAgents);
  const empties = [];
  for (let h = 1; h <= 12; h++) {
    for (const f of FACES) {
      const key = `h${h}-${f}`;
      if (!grouped[key] || grouped[key].length === 0) {
        empties.push({
          hour: h,
          face: f,
          label: `${HOURS[h].name} (${f})`,
        });
      }
    }
  }
  return empties;
}

// Compute the union of vector occupants for an agent — the set of agents
// the bound would consist of under Option A (CHARD3_PLAN.md). Excludes self.
// Returns [] when both vectors are empty (vector-isolated agent).
export function vectorOccupants(agent, allAgents) {
  if (!hasArchetypeBase(agent)) return [];
  const { geometric, attitudinal } = refusalVectors(agent.hour, agent.face);
  const geoms = agentsAtCell(allAgents, geometric).filter((a) => a.name !== agent.name);
  const atts = agentsAtCell(allAgents, attitudinal).filter((a) => a.name !== agent.name);
  // De-dup by name (an agent can't be in both vectors simultaneously, but
  // defensive in case of future spec changes).
  const seen = new Set();
  const out = [];
  for (const a of [...geoms, ...atts]) {
    if (!seen.has(a.name)) {
      seen.add(a.name);
      out.push(a);
    }
  }
  return out;
}

// Predicate — true when the agent has zero vector occupants in the active set.
// Used by bounded-system-prompt.js to decide bound construction policy.
export function isVectorIsolated(agent, allAgents) {
  return hasArchetypeBase(agent) && vectorOccupants(agent, allAgents).length === 0;
}
