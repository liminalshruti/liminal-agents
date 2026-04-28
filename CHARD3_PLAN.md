# c-hard-iii — geometry load-bearing on the introspective surface

Plan for making bounded refusal *structurally enforced* (not advisory) on
the 12-agent introspective surface. PPA #4 patent claim becomes binding
at three layers: prompt, validator, runtime test.

**Scope this week:** introspective set only. Agency / sandbox follow next
week per (γ).

**Non-scope:** modifying phase1's `archetype-base.js` geometry logic. We
consume it; we don't re-derive it.

This file is a planning artifact. Read; correct; the implementation that
follows it is task #7.

---

## 1. Coverage audit

Phase1 typed all 12 introspective agents with `(hour, face)` per
`~/liminal/founder-brain/liminal-ip/02-models/two-faced-archetype-system.md`:

| Agent | Hour | Face | Register | Geom-opp (h+6, same face) | Attitude-opp (same h, other face) |
|---|---:|---|---|---|---|
| Architect | 10 | inner | Structural | outer-4 — **empty** | outer-10 — empty |
| Strategist | 5 | inner | Structural | inner-11 — Elder+Historian | outer-5 — empty |
| Economist | 5 | inner | Structural | inner-11 — Elder+Historian | outer-5 — empty |
| Witness | 12 | inner | Somatic | inner-6 — **empty** | outer-12 — empty |
| Physician | 8 | inner | Somatic | inner-2 — Cartographer | outer-8 — empty |
| Child | 1 | inner | Somatic | inner-7 — Contrarian+Mystic+Betrayer | outer-1 — empty |
| Historian | 11 | inner | Temporal | inner-5 — Strategist+Economist | outer-11 — empty |
| Cartographer | 2 | inner | Temporal | inner-8 — Physician | outer-2 — empty |
| Elder | 11 | inner | Temporal | inner-5 — Strategist+Economist | outer-11 — empty |
| Contrarian | 7 | inner | Symbolic | inner-1 — Child | outer-7 — empty |
| Mystic | 7 | inner | Symbolic | inner-1 — Child | outer-7 — empty |
| Betrayer | 7 | inner | Symbolic | inner-1 — Child | outer-7 — empty |

**Critical observation: all 12 introspective agents are inner-face.** No
outer-face peers exist in this set. The attitudinal-opposite vector is
empty for every agent.

**Geometric coverage:** 8 of 12 agents have ≥1 geometric occupant. Four
agents (Architect, Witness — and re-checking — actually only 2:
Architect's outer-4 is empty; Witness's inner-6 is empty) have
**no geometric occupant at all** in the introspective set:

- **Architect** (10-inner) — outer-4 empty
- **Witness** (12-inner) — inner-6 empty

(Earlier draft listed 4 — Physician's inner-2 IS occupied by
Cartographer; Cartographer's inner-8 IS occupied by Physician. Re-check
confirms only Architect and Witness are vector-isolated.)

This means: **strict-only geometry is not viable.** Forcing Architect and
Witness to refuse only to vector occupants would force them to either
refuse incorrectly (no occupant exists) or invent agent names (the very
PPA #4 violation we're trying to prevent).

---

## 2. The policy decision

Three options for what "geometry load-bearing" means in code:

### Option A — Strict geometry, full-allowlist fallback only when vectors empty

The bound becomes:
```
allowlist_for(agent) :=
  if vector_occupants(agent) is non-empty
    then vector_occupants(agent)
    else all_other_agents(agent)
```

Architect and Witness fall back to full allowlist (because their
vectors are empty). All other 10 agents are bounded to their geometric
occupants only — Strategist refuses only to Elder/Historian, never to
Witness or Cartographer. **This is the strictest viable policy.**

Trade: 10 of 12 agents have a *narrower* refusal surface. If a request
to Strategist actually belongs to Cartographer (life-stage terrain
shaped as forward-move), Strategist must either work it (in-domain
miss) or refuse to Elder/Historian (wrong target). Cartographer is
unreachable from Strategist under strict geometry.

**Patent payoff:** maximum. Refusal IS geometry, except for two
named-and-justified exceptions documented as "vector-isolated".

### Option B — Strict geometry, full-allowlist fallback always available

The bound becomes:
```
allowlist_for(agent) := vector_occupants(agent) ∪ all_other_agents(agent)
```

Geometric occupants are **prioritized in the prompt** ("prefer X / Y
when redirecting"); full allowlist remains as authoritative bound. This
is *exactly* what phase1 already installs as additive hints. Option B
is "phase1's additive hint, but with the prompt-level priority made
stronger." No new structural enforcement.

**Patent payoff:** marginal. Geometry is prose-level; bound is
unchanged.

### Option C — Strict geometry with documented escape valve

The bound becomes:
```
allowlist_for(agent) := vector_occupants(agent) ∪ {ESCAPE_VALVE_AGENTS}

where ESCAPE_VALVE_AGENTS is a small named set per agent declaring
the cross-register cells they may legitimately route to.
```

Each agent declares 0–2 explicit cross-register routes ("Architect may
also refuse to Witness for somatic-shaped requests"). All other refusal
targets are blocked. This is **the strictest policy that retains
cross-register coverage.**

Trade: requires per-agent cross-register escape declarations. Adds work
but makes the policy explicit.

**Patent payoff:** maximum *and* defensible cross-register routing.
Geometry is binding; escape valves are explicit, named, frozen.

---

## 3. Recommendation

**Option A.** Reasoning:

1. The two-axis-archetype spec at
   `~/liminal/founder-brain/liminal-ip/02-models/two-faced-archetype-system.md`
   says geometric opposite is the structurally most-likely correct
   redirect when domain crosses. Cross-register routing is a *correction
   stream signal*, not a refusal-routing signal.
2. Architect at 10-inner and Witness at 12-inner being vector-isolated
   is *itself* a structural finding worth surfacing. The PATENT_CLAIMS
   doc names them as "vector-isolated agents whose refusal allowlist
   degrades to full-fallback." Documented, defensible.
3. Option C requires cross-register escape declarations and bumps the
   complexity meaningfully. Option B leaves the patent claim where
   phase1 already has it (advisory). Option A gives maximum patent
   payoff with minimum new mechanism.

**The fallback for Architect / Witness is the *full allowlist* — the
classical bound.** They behave today exactly as they did pre-c-hard-iii.
That's why the residual is 10/12 agents now strictly bounded, 2/12
unchanged.

---

## 4. Implementation shape

### Layer 1 — Prompt (lib/agents/bounded-system-prompt.js)

Replace phase1's "additive hint" with policy-A bound construction.

**Before (phase1):**
```
allowlist = full_allowlist(agent)        // bound
routingHint = vector_names_if_typed       // hint
prompt = baseSystem + REFUSAL(allowlist) + routingHint
```

**After (c-hard-iii):**
```
let bound;
if (hasArchetypeBase(agent)) {
  const occupants = vector_occupants(agent);
  if (occupants.length > 0) {
    bound = occupants;
    boundExplanation = "geometry-bound: refusal target must be one of these structurally adjacent agents.";
  } else {
    bound = full_allowlist(agent);
    boundExplanation = "vector-isolated agent: refusal target may be any other agent.";
  }
} else {
  bound = full_allowlist(agent);
  boundExplanation = "untyped agent: refusal target may be any other agent.";
}
prompt = baseSystem + REFUSAL_PROTOCOL(bound, boundExplanation);
```

The full-allowlist appears in the prompt **only when the agent is
vector-isolated**, plus a phrase like "(vector-isolated)" so a future
reader of the prompt understands why the bound is wider.

The phase1 routing-hint section (geometric / attitudinal verbal hints)
becomes redundant under Option A — the bound itself IS the hint. Keep
it for now; remove in the same commit that lands Layer 1.

### Layer 2 — Validator (lib/agents/validation.js)

Add a new classification kind: `geometry_violation`.

```
classifyInterpretation(text, allAgents, opts = {})
  // opts.activeAgent — the agent that produced this text. When provided,
  // and when activeAgent has (hour, face) typing, AND vector occupants
  // are non-empty, AND text is a valid_refusal naming a target outside
  // the vector cells, return kind='geometry_violation' instead of
  // 'valid_refusal'.
```

Backward compatible: today's call sites pass `(text, allAgents)`. New
call sites pass the third argument and get the geometry check.
Out-of-vector refusals are a *warning* (logged, not thrown) — the
runtime still accepts the refusal but the test layer (Layer 3) fails
on any geometry_violation in the integration test set.

This keeps the runtime *forgiving* (one drift doesn't crash a /check
session) but makes the test suite *strict* (no PR can land that
introduces a drift).

### Layer 3 — Runtime test

`test/geometry-binding.test.js` — for each of the 10 vector-bound
agents (excluding Architect and Witness), run the agent against a
deliberately out-of-domain prompt that should trigger refusal,
classify the response with `activeAgent=` set, and assert
`kind !== 'geometry_violation'`.

This requires real API calls. Two sub-options:

- **a) Stubbed model:** mock `client.messages.create` to return
  hand-crafted refusal responses (one valid, one geometry-violating)
  per agent. Tests the *validator's* geometry check, not the model's
  compliance.
- **b) Live model:** run against Opus 4.7 with `LIMINAL_GEOMETRY_TEST=1`
  gate. Skip in CI, run locally before patent-claim release.

**Recommendation:** ship both. (a) becomes part of `npm test` and runs
the validator's geometry-checking logic against synthetic refusals.
(b) is a manual gate before any release that touches the bounded-prompt
composer.

---

## 5. Migration safety

- **Existing 50 tests must continue to pass.** No test today exercises
  the geometry path; Option A widens the bound for Architect and
  Witness (no change vs. today) and *narrows* it for the other 10
  (smaller allowlist string in the prompt, but the protocol is
  unchanged). No test asserts the prompt's exact length or content
  beyond "contains REFUSAL PROTOCOL" — patent-claims test #2 already
  asserts allowlist coverage. Option A *narrows* the allowlist, which
  *would* break test #2 unless we modify test #2 to assert "vector
  occupants OR vector-isolated full allowlist."

  **→ Test #2 must be updated as part of Layer 1.** Concrete change:
  for each agent, assert one of:
    - the prompt contains every other agent's name (vector-isolated agents), OR
    - the prompt contains every vector-occupant agent's name AND no other agent's name AND a "vector-bound" marker phrase.

- **Phase1 stash compatibility.** When Shayaun resumes phase1, his
  branch's `bounded-system-prompt.js` will conflict with this branch's.
  Resolution: this branch's version wins (it's the canonical c-hard-iii
  enforcement); phase1's additive routing-hint becomes redundant.

  **→ I will leave a comment in `bounded-system-prompt.js` referencing
  this plan file and the phase1 stash, so the resolution direction is
  unambiguous when phase1 picks up.**

- **No vault schema change.** Geometry policy is a prompt-construction
  + validator concern; vault remains the four canonical tables +
  `agent_views`. Phase1's `events.js` substrate migration is unaffected.

---

## 6. Acceptance criteria

c-hard-iii is "done" when:

1. ✓ `bounded-system-prompt.js` constructs the bound per Option A.
2. ✓ Every vector-bound agent's prompt contains *only* its vector
   occupants in the allowlist; vector-isolated agents (Architect,
   Witness) still get the full allowlist with a "(vector-isolated)"
   marker.
3. ✓ `validation.js` exposes `geometry_violation` classification when
   given `opts.activeAgent`.
4. ✓ Patent test #2 updated to the dual-form assertion (vector-bound
   OR vector-isolated).
5. ✓ New test: `test/geometry-binding.test.js` with stubbed-model
   geometry validator coverage.
6. ✓ `PATENT_CLAIMS.md` Claim 1 section updated to name the geometry
   binding and the two named vector-isolated exceptions.
7. ✓ All existing tests pass; the new test passes.

---

## 7. Out of scope (queue for align)

- **Sandbox / agency surface.** Per (γ), introspective only this week.
  Sandbox has 12 agents with `(hour, face)` typing on phase1; agency
  has 3 with no `baseSystem` pattern. Both wait.
- **Phase1's archetype-base.js modifications.** We consume that module
  as-is.
- **Refactor agency-set agents to baseSystem + buildBoundedSystemPrompt.**
  Queue-for-align item from the audit (C4).
- **Geometric-opposite repair on Architect / Witness.** The structural
  question of "why is outer-4 empty, why is inner-6 empty" lives in
  `02-models/two-faced-archetype-system.md` — a product-IP question,
  not a code question. Out of scope for this week's code-level
  implementation.
