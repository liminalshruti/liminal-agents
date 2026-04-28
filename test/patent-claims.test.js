// Patent-claim anti-regression tests.
//
// These tests exist to make the structural claims in PATENT_CLAIMS.md
// load-bearing. Each test maps to a specific claim:
//
//   Test 1 → PPA #5 frozen 9-tag taxonomy + schema_version coupling
//   Test 2 → PPA #4 bounded prompt always emits allowlist + protocol
//   Test 3 → PPA #5 agents do not read corrections (correction loop
//            does not converge — agents stay bounded; the record
//            compounds)
//   Test 4 → SSRF chokepoint — fetch() called only inside safeFetch
//   Test 5 → PPA #4 refusal validator flags refusals naming agents
//            outside the allowlist
//
// Failing any of these means the patent surface has weakened. Do not
// disable; instead, name the claim change and bump the corresponding
// schema_version where applicable.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORRECTION_TAGS,
  CORRECTION_TAG_DESCRIPTIONS,
  isValidTag,
} from "../lib/correction-tags.js";
import {
  INTROSPECTIVE_AGENTS,
  AGENCY_AGENTS,
} from "../lib/agents/index.js";
import { buildBoundedSystemPrompt } from "../lib/agents/bounded-system-prompt.js";
import { classifyInterpretation } from "../lib/agents/validation.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Test 1 — PPA #5 frozen taxonomy + schema_version coupling ───────────

test("PPA #5 — correction taxonomy is frozen at 9 tags; main and sandbox stay in sync", () => {
  // The 9-tag taxonomy is the structural moat for PPA #5. Adding a 10th tag
  // is a decision that requires bumping schema_version on the corrections
  // table and the JSON Schema. This test fails the moment count diverges.

  const EXPECTED_TAGS = [
    "wrong_frame",
    "wrong_intensity",
    "wrong_theory",
    "right_but_useless",
    "right_but_already_known",
    "too_generic",
    "missed_compensation",
    "assumes_facts_not_in_evidence",
    "off_by_layer",
  ];

  assert.deepEqual(
    [...CORRECTION_TAGS],
    EXPECTED_TAGS,
    "main correction tags drifted — bump schema_version on corrections + correction.v1.json before changing this list",
  );

  // Object.freeze is enforced — attempt to mutate must throw in strict mode.
  assert.throws(
    () => CORRECTION_TAGS.push("new_tag"),
    /Cannot add property|read only|frozen|extensible/,
    "CORRECTION_TAGS must be frozen — Object.freeze missing or weakened",
  );

  // Every tag must have a description (no orphans).
  for (const tag of CORRECTION_TAGS) {
    assert.ok(
      CORRECTION_TAG_DESCRIPTIONS[tag],
      `tag ${tag} missing from CORRECTION_TAG_DESCRIPTIONS`,
    );
  }

  // Validator stays consistent with the frozen list.
  for (const tag of CORRECTION_TAGS) {
    assert.ok(isValidTag(tag), `isValidTag rejects frozen tag ${tag}`);
  }
  assert.equal(isValidTag("imaginary_tag"), false);
  assert.ok(isValidTag(null), "null permitted for legacy rows");

  // Sandbox tags must match main (the patent claim spans both surfaces).
  const sandboxTagFile = path.join(REPO_ROOT, "sandbox/lib/correction-tags.js");
  if (fs.existsSync(sandboxTagFile)) {
    const src = fs.readFileSync(sandboxTagFile, "utf8");
    for (const tag of EXPECTED_TAGS) {
      assert.ok(
        src.includes(`"${tag}"`),
        `sandbox correction-tags.js missing "${tag}" — main and sandbox must stay in sync`,
      );
    }
  }

  // The schema_version on corrections.v1 must remain 1 until the taxonomy
  // changes; if the taxonomy changes (this test fails above), bumping
  // happens in the same change.
  const schemaPath = path.join(REPO_ROOT, "schemas/correction.v1.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  // The schema's tag enum must equal the frozen list (modulo null, which
  // is intentionally present for legacy correction rows that pre-date the
  // taxonomy).
  const schemaEnum = schema.properties?.tag?.enum;
  if (Array.isArray(schemaEnum)) {
    const nonNull = schemaEnum.filter((t) => t !== null).sort();
    assert.deepEqual(
      nonNull,
      [...EXPECTED_TAGS].sort(),
      "correction.v1.json tag enum drifted from CORRECTION_TAGS",
    );
  }
});

// ─── Test 2 — PPA #4 bounded prompt always emits allowlist + protocol ────

test("PPA #4 — every introspective agent's bounded prompt contains a structurally-correct allowlist + REFUSE protocol", async () => {
  // Bounded refusal is structurally enforced if and only if every agent's
  // composed system prompt (a) lists the allowed peer agents by name, and
  // (b) declares the strict REFUSE: <agent>\n<one-sentence> protocol. If
  // either is absent for any agent, refusals can drift to invented names
  // and PPA #4 weakens to convention.
  //
  // Under c-hard-iii (CHARD3_PLAN.md, Option A), the bound is geometry-
  // derived: for vector-bound agents, only the geometric/attitudinal
  // vector occupants appear in the allowlist; for vector-isolated agents
  // (Architect, Witness — see CHARD3 audit table), the full allowlist
  // applies. The dual-form check below admits both shapes.

  const { describeBound } = await import("../lib/agents/bounded-system-prompt.js");

  for (const agent of INTROSPECTIVE_AGENTS) {
    const prompt = agent.system;
    assert.ok(
      typeof prompt === "string" && prompt.length > 0,
      `agent ${agent.name} has no composed system prompt`,
    );

    // (b) protocol — exact phrase is the chokepoint.
    assert.match(
      prompt,
      /REFUSAL PROTOCOL — STRICT/,
      `agent ${agent.name} prompt missing REFUSAL PROTOCOL header`,
    );
    assert.match(
      prompt,
      /Line 1: REFUSE: <correct agent name>/,
      `agent ${agent.name} prompt missing canonical refusal format`,
    );

    // (a) allowlist — depends on the agent's bound kind.
    const bound = describeBound(agent, INTROSPECTIVE_AGENTS);
    assert.ok(
      bound.bound.length > 0,
      `agent ${agent.name} has empty bound — should be impossible`,
    );

    if (bound.kind === "geometry-bound") {
      // Every vector occupant must appear; non-occupants must NOT appear
      // in the structural allowlist phrase. We verify the "refuse to one
      // of these agent names only:" line specifically.
      const allowlistMatch = prompt.match(
        /refuse to one of these agent names only:\s*([^.]+)\./,
      );
      assert.ok(
        allowlistMatch,
        `agent ${agent.name}: could not locate allowlist phrase`,
      );
      const allowlistText = allowlistMatch[1];
      for (const occupantName of bound.bound) {
        assert.ok(
          allowlistText.includes(occupantName),
          `agent ${agent.name} (geometry-bound) allowlist missing vector occupant ${occupantName}`,
        );
      }
      // GEOMETRY explainer line must be present and reference verbs.
      assert.match(
        prompt,
        /GEOMETRY:/,
        `agent ${agent.name} (geometry-bound) missing GEOMETRY explainer`,
      );
    } else if (bound.kind === "vector-isolated") {
      // Vector-isolated: full allowlist + the isolation notice.
      for (const peer of INTROSPECTIVE_AGENTS) {
        if (peer.name === agent.name) continue;
        assert.ok(
          prompt.includes(peer.name),
          `agent ${agent.name} (vector-isolated) prompt missing peer ${peer.name}`,
        );
      }
      assert.match(
        prompt,
        /vector-isolated/,
        `agent ${agent.name} (vector-isolated) missing isolation notice`,
      );
    } else {
      // Untyped — classical full allowlist.
      for (const peer of INTROSPECTIVE_AGENTS) {
        if (peer.name === agent.name) continue;
        assert.ok(
          prompt.includes(peer.name),
          `agent ${agent.name} (untyped) prompt missing peer ${peer.name}`,
        );
      }
    }
  }

  // The composer itself must throw on a missing baseSystem — defensive.
  assert.throws(
    () => buildBoundedSystemPrompt({ name: "X" }, INTROSPECTIVE_AGENTS),
    /baseSystem required/,
  );
  assert.throws(
    () => buildBoundedSystemPrompt({ baseSystem: "x" }, []),
    /allAgents must be a non-empty array/,
  );
});

// ─── Test 3 — PPA #5 agents do not read corrections ──────────────────────

test("PPA #5 — no agent module imports from corrections (correction loop does not converge)", () => {
  // The patent claim "agents stay bounded; the record compounds" requires
  // that no agent's prompt-construction or task-construction reads past
  // user corrections. A future PR adding `import { ... } from
  // "../correction-tags.js"` (or any read of the corrections table) inside
  // lib/agents/ silently breaks PPA #5. This test scans the agent module
  // tree for forbidden imports.

  const agentsDir = path.join(REPO_ROOT, "lib/agents");
  const forbidden = [
    /from ["'].*correction-tags/, // any correction-tags import
    /from ["'].*store-correction/,
    /FROM\s+corrections/i, // SQL reads
    /SELECT\s+.*\s+FROM\s+corrections/i,
    /correction_tags|CORRECTION_TAGS/, // direct symbol reference
  ];

  // Allow correction-tags references in this test file itself by skipping
  // the test directory — we scan only lib/agents/.
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".js"));

  for (const f of files) {
    const filePath = path.join(agentsDir, f);
    const src = fs.readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(src),
        false,
        `agent module ${f} contains forbidden correction-stream reference matching ${pattern} — PPA #5 violation`,
      );
    }
  }
});

// ─── Test 4 — SSRF chokepoint ────────────────────────────────────────────

test("SSRF — fetch() in skills/agency/run.js is reachable only via safeFetch", () => {
  // The SSRF guard is single-chokepoint. A second `fetch(` call site
  // outside safeFetch silently bypasses the IP/scheme/redirect filtering.
  // This test asserts that the only `fetch(` call in the agency
  // orchestrator is inside the safeFetch function body.

  const filePath = path.join(REPO_ROOT, "skills/agency/run.js");
  const src = fs.readFileSync(filePath, "utf8");

  // Find all `fetch(` occurrences (excluding `safeFetch(`).
  const matches = [];
  const re = /(?<!safe)fetch\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    matches.push(m.index);
  }
  assert.equal(
    matches.length,
    1,
    `expected exactly one fetch( call in agency/run.js (inside safeFetch); found ${matches.length}`,
  );

  // Confirm the one match is inside safeFetch — anchor on the function's
  // opening line and check the match index falls within that function's
  // text range.
  const safeFetchStart = src.indexOf("async function safeFetch");
  assert.ok(safeFetchStart >= 0, "safeFetch function not found");
  // Find the matching closing brace for safeFetch by simple brace counting.
  let braceDepth = 0;
  let i = src.indexOf("{", safeFetchStart);
  let safeFetchEnd = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") braceDepth++;
    else if (src[i] === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        safeFetchEnd = i;
        break;
      }
    }
  }
  assert.ok(safeFetchEnd > safeFetchStart, "could not find end of safeFetch");
  const fetchPos = matches[0];
  assert.ok(
    fetchPos > safeFetchStart && fetchPos < safeFetchEnd,
    `fetch( call at index ${fetchPos} is outside safeFetch [${safeFetchStart},${safeFetchEnd}] — SSRF chokepoint bypassed`,
  );

  // Also assert the IP guards exist (if these are removed, SSRF is gone).
  assert.match(src, /isPrivateIPv4/, "isPrivateIPv4 guard missing");
  assert.match(src, /isPrivateIPv6/, "isPrivateIPv6 guard missing");
  assert.match(src, /redirect:\s*"manual"/, "manual redirect handling missing");
});

// ─── Test 5 — Refusal validator flags out-of-allowlist targets ───────────

test("PPA #4 — classifyInterpretation flags refusals naming agents outside the allowlist", () => {
  // The validator is the runtime teeth on the bounded-refusal claim. If a
  // future change relaxes classification (e.g., accepts any name), refusals
  // can name "Synthesizer" or other invented agents and PPA #4 erodes from
  // structural to advisory. This test pins the four kinds.

  // Valid: REFUSE: NAME on first line, allowed name.
  const valid = classifyInterpretation(
    "REFUSE: Witness\nThe felt experience is the Witness's lane.",
    INTROSPECTIVE_AGENTS,
  );
  assert.equal(valid.kind, "valid_refusal");
  assert.equal(valid.target, "Witness");

  // Unknown target — agent invented "Synthesizer".
  const unknown = classifyInterpretation(
    "REFUSE: Synthesizer\nNot a real agent.",
    INTROSPECTIVE_AGENTS,
  );
  assert.equal(unknown.kind, "unknown_target");
  assert.equal(unknown.target, "Synthesizer");

  // Malformed — REFUSE: with no name token.
  const malformed = classifyInterpretation(
    "REFUSE: \nNo agent named.",
    INTROSPECTIVE_AGENTS,
  );
  assert.equal(malformed.kind, "malformed_refusal");

  // Prose — non-refusal output.
  const prose = classifyInterpretation(
    "The structure here is a constraint loop running on attention.",
    INTROSPECTIVE_AGENTS,
  );
  assert.equal(prose.kind, "prose");

  // Empty.
  const empty = classifyInterpretation("   ", INTROSPECTIVE_AGENTS);
  assert.equal(empty.kind, "empty");

  // Case-insensitive normalization (refusals coming back lowercased should
  // still resolve to the canonical agent name).
  const lower = classifyInterpretation(
    "REFUSE: witness\nLowercased.",
    INTROSPECTIVE_AGENTS,
  );
  assert.equal(lower.kind, "valid_refusal");
  assert.equal(lower.target, "Witness");
  assert.equal(lower.normalized, true);

  // Agency surface — same validator must work against the agency allowlist.
  const agencyValid = classifyInterpretation(
    "REFUSE: SDR\nDrafting outreach is the SDR's lane.",
    AGENCY_AGENTS,
  );
  assert.equal(agencyValid.kind, "valid_refusal");
  assert.equal(agencyValid.target, "SDR");
});
