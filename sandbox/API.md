# Liminal Sandbox — Backend API

JSON HTTP API. Localhost only. CORS open for any origin (the TUI is expected to call from the same machine).

## Run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-api03-...        # or: claude setup-token
PORT=3000 npm start                               # default port 3000
```

If `ANTHROPIC_API_KEY` is unset and `claude` CLI is on PATH, the backend falls back to `claude -p`. CLI mode adds ~25–40s per agent and serializes calls (single-flight). API mode is what you want for live demos.

`GET /api/health` returns `{ ok: true, service: "liminal-sandbox", version: "0.1.0" }`. Use that for a startup probe.

## Data model

Five core tables + two FTS5 virtual tables in `liminal-agency.db` (SQLite, WAL mode, located next to `package.json` by default; override with `LIMINAL_DB`).

- `snapshots(id, timestamp, kind, text, label, archived)` — items dropped into the vault. `kind ∈ {meeting, decision, incident, paste}`. `archived = 1` hides from active vault but preserves history.
- `readings(id, timestamp, snapshot_ids, snapshot_ids_hash, snapshot_count, signal_summary, threads, model, client_mode)` — one full pass: synthesis + N agent reads, hash-keyed by sorted snapshot ID list.
- `agent_views(reading_id, agent_key, register, interpretation)` — *normalized*: one row per (reading, agent). Agent count is data, not schema. Primary key is `(reading_id, agent_key)`.
- `corrections(id, reading_id, agent, tag, note, timestamp)` — user pushback on a specific agent's read. `agent ∈ ` the 12 canonical keys. `tag ∈ ` the canonical 9 (see `/api/tags`).
- `refined_views(id, reading_id, agent_key, refinement_input, interpretation, timestamp, parent_refined_id)` — bounded re-reads. Originals in `agent_views` are preserved; refinements are additive. Chains via `parent_refined_id` (intra-agent only).
- `snapshots_fts`, `corrections_fts` — SQLite FTS5 virtual tables for `/api/retrieve`. BM25-scored. Sync triggers on INSERT/UPDATE/DELETE keep them current.

`readings.snapshot_ids` and `readings.threads` are stored as JSON strings in the DB but always returned as arrays in API responses.

## The 12 canonical agent keys

```
analyst   researcher   forensic        ── Diligence ──   (tools: fetch_url)
sdr       closer       liaison         ── Outreach
auditor   strategist   skeptic         ── Judgment
operator  scheduler    bookkeeper      ── Operations
```

Refusal protocol: when out of lane, agents respond with exactly `REFUSE: <AgentName> · <one-sentence boundary>`. Validation happens at runtime (see `lib/agents/validation.js`); malformed refusals are logged but not rejected.

## Endpoints

### `GET /api/health`

Liveness probe.

```json
{ "ok": true, "service": "liminal-sandbox", "version": "0.1.0" }
```

### `GET /api/tags`

Canonical correction taxonomy. Frozen — do not display tags not in this list.

```json
{
  "tags": ["wrong_frame", "wrong_intensity", "wrong_theory",
           "right_but_useless", "right_but_already_known", "too_generic",
           "missed_compensation", "assumes_facts_not_in_evidence", "off_by_layer"],
  "descriptions": { "wrong_frame": "...", "wrong_intensity": "...", "...": "..." }
}
```

### `GET /api/snapshots`

Active (non-archived) vault, oldest-first by timestamp.

```json
{
  "snapshots": [
    { "id": "...", "timestamp": 1714073280000, "kind": "meeting",
      "text": "Customer X escalated...", "label": "Customer X" }
  ]
}
```

### `POST /api/snapshots`

Drop a snapshot into the vault.

Request:
```json
{ "kind": "meeting|decision|incident|paste", "text": "...", "label": "<optional>", "timestamp": <optional> }
```

Response: `{ "ok": true, "snapshot": { "id": "...", "timestamp": ..., "kind": "...", "text": "...", "label": "..." } }`.

Errors: 400 on missing/invalid `kind` or `text`.

### `POST /api/snapshots/clear`

Archives every active snapshot. `{ "ok": true }`. Does not delete (preserves history).

### `POST /api/seed`

Seeds the vault with 5 demo snapshots (Customer X escalation, Eric absence, head-of-eng deferred, sleep loss). Useful for testing without real data.

```json
{ "ok": true, "count": 5 }
```

### `POST /api/read`

Run a reading across the entire active vault. Synchronous — returns when synthesis + all 12 agent calls finish. Cache-keyed by `(snapshot_ids_hash, model)` — re-reads on the same vault return in ~120ms.

- API mode: ~30–60s for synthesis + 12 parallel agent calls.
- CLI mode: ~100–180s (calls serialize through a single-flight queue).

No request body required. Implicitly uses every active snapshot.

Response:
```json
{
  "reading_id": "...",
  "cached": false,
  "timestamp": 1714073280000,
  "snapshot_count": 5,
  "snapshot_ids": ["...", "..."],
  "signal_summary": "<one paragraph from Opus 4.7>",
  "threads": [{ "label": "...", "snapshot_ids": ["..."], "summary": "..." }],
  "agents": {
    "analyst":    { "name": "Analyst",    "key": "analyst",    "register": "Diligence",  "domain": "...", "interpretation": "...", "classification": "prose", "tool_turns": 0 },
    "researcher": { "name": "Researcher", "key": "researcher", "register": "Diligence",  "domain": "...", "interpretation": "...", "classification": "prose", "tool_turns": 0 },
    "...":        { "...": "..." }
  },
  "agent_errors": [],
  "model": "claude-opus-4-7",
  "client_mode": "api"
}
```

Per-agent fields:
- `interpretation` — the agent's text output (or empty string on error).
- `classification` — `"prose" | "valid_refusal" | "malformed_refusal" | "unknown_target" | "empty"`.
- `tool_turns` — count of tool-use cycles the agent ran (0 unless agent has `fetch_url` and used it).
- On failure, the agent entry has `error: true`, `error_reason: "..."`, and `interpretation: ""`. The agent is also listed in `agent_errors`.

`agent_errors` is `[]` when all 12 succeed; populated with `{ agent_key, reason }` per failure. Failed agents are not stored as `agent_views` rows. The reading row is still stored even if all 12 agents fail — preserves the audit trail.

Errors: 400 if vault is empty, 401 on missing/invalid Anthropic credential, 500 on synthesis failure or other runtime errors. All errors include a `remediation` field.

### `GET /api/readings?limit=25`

Recent readings, newest-first. `limit` clamped to 100. No interpretations included — use `/api/readings/:id` for the full body.

```json
{
  "readings": [
    { "id": "...", "timestamp": ..., "snapshot_count": 5,
      "signal_summary": "...", "model": "claude-opus-4-7", "client_mode": "api" }
  ]
}
```

### `GET /api/readings/:id`

Full reading + all corrections filed on it. Agents block now keyed by agent_key (not the legacy hardcoded fields).

```json
{
  "reading_id": "...",
  "timestamp": ...,
  "snapshot_count": 5,
  "snapshot_ids": ["..."],
  "signal_summary": "...",
  "threads": [...],
  "agents": {
    "analyst":    { "key": "analyst",    "register": "Diligence",  "interpretation": "..." },
    "researcher": { "key": "researcher", "register": "Diligence",  "interpretation": "..." },
    "...":        { "...": "..." }
  },
  "model": "...",
  "client_mode": "...",
  "corrections": [
    { "id": "...", "agent": "analyst", "tag": "missed_compensation", "note": null, "timestamp": ... }
  ]
}
```

404 if `reading_id` is unknown.

### `POST /api/correction`

File a correction on a specific agent's read. Stored locally; agents never read corrections.

Request:
```json
{ "reading_id": "...", "agent": "<one of the 12 keys>", "tag": "<one of the 9>", "note": "<optional>" }
```

Response: `{ "ok": true, "correction_id": "..." }`.

Errors:
- 400 missing fields — response includes `required: ["reading_id", "agent", "tag"]` and `optional: ["note"]`.
- 400 bad agent — response includes `valid_agents: [...]` (all 12 keys).
- 400 invalid tag — response includes `valid_tags: [...]` (all 9 tags).
- 404 unknown `reading_id`.
- 500 if the DB insert fails — response includes `remediation: "check server logs"`.

Multiple corrections can be filed on the same `(reading_id, agent)`. The TUI tracks "applied" state locally; aggregate correction shape is in `/api/doctrine`.

### `POST /api/refine`

Bounded re-read of a single agent. Re-runs ONE agent on the same synthesis with extra user-provided context. The other 11 agents are NOT consulted — the disagreement architecture is preserved. Original `agent_views` rows are preserved; refinements are stored in `refined_views`.

Request:
```json
{
  "reading_id": "...",
  "agent_key": "<one of the 12 keys>",
  "refinement": "the head of eng I'm deferring is named Sean",
  "parent_refined_id": "<optional, to chain refinements>"
}
```

Chain semantics: pass `parent_refined_id` to continue the same agent's iteration on a previous refinement. Cross-agent chaining is rejected at the boundary (parent must be from the same `agent_key`).

Response:
```json
{
  "ok": true,
  "refined_id": "...",
  "reading_id": "...",
  "agent_key": "strategist",
  "parent_refined_id": null,
  "interpretation": "<the agent's refined read>",
  "classification": "prose",
  "tool_turns": 0,
  "timestamp": 1714073280000,
  "client_mode": "api"
}
```

Errors:
- 400 missing fields, invalid `agent_key`, empty `refinement`.
- 401 missing Anthropic credential.
- 404 unknown `reading_id` or unknown `parent_refined_id`.

### `GET /api/refinements/:reading_id/:agent_key`

List the refinement chain for a `(reading, agent)` pair, oldest first.

```json
{
  "reading_id": "...",
  "agent_key": "strategist",
  "refinements": [
    { "id": "...", "refinement_input": "...", "interpretation": "...", "timestamp": ..., "parent_refined_id": null },
    { "id": "...", "refinement_input": "...", "interpretation": "...", "timestamp": ..., "parent_refined_id": "<previous>" }
  ]
}
```

Returns `refinements: []` when no refinements have been done for that pair.

### `POST /api/retrieve`

BM25 retrieval over snapshots and/or corrections via SQLite FTS5. Default tokenizer sanitizes input by quoting each token (defense against FTS5 operator injection); pass `raw: true` for advanced queries (boolean operators, NEAR, etc.).

Request:
```json
{
  "query": "customer escalation",
  "limit": 10,
  "kind": "all",
  "agent": "analyst",
  "tag": "wrong_frame",
  "raw": false
}
```

- `query` — required.
- `kind` — `"snapshots" | "corrections" | "all"` (default `"all"`).
- `limit` — 1–50 (default 10, clamped).
- `agent` / `tag` — filter corrections (ignored when `kind: "snapshots"`).
- `raw` — pass `true` to skip the tokenizer sanitization (advanced).

Response (when `kind: "all"`):
```json
{
  "query": "customer escalation",
  "snapshots": [
    { "id": "...", "timestamp": ..., "kind": "incident", "text": "Customer X escalated...",
      "label": "...", "archived": 0, "score": -3.21 }
  ],
  "corrections": [
    { "id": "...", "reading_id": "...", "agent": "analyst", "tag": "wrong_frame",
      "note": "missed customer X recurrence", "timestamp": ..., "score": -2.04 }
  ]
}
```

Score is BM25; lower (more negative) is better. Results are pre-sorted best-first.

Errors:
- 400 missing/empty `query` — response includes an `example` payload.
- 400 invalid `kind`.

### `GET /api/doctrine`

Aggregated correction stats. The "moat" view.

```json
{
  "by_agent_tag": [
    { "agent": "analyst", "tag": "missed_compensation", "count": 5 },
    { "agent": "skeptic", "tag": "too_generic",         "count": 3 }
  ],
  "by_agent": [
    { "agent": "analyst", "count": 6 },
    { "agent": "skeptic", "count": 3 }
  ],
  "total_readings": 4,
  "total_corrections": 11,
  "active_snapshots": 5
}
```

## Tools (per-agent capabilities)

Tools are scoped per-agent. Each agent's `tools` array on its registry entry declares which tools the orchestrator passes to the Anthropic API for that agent. Other agents do NOT see the tool, cannot call it, and refuse out-of-lane requests instead.

Currently registered:

| Tool | Schema | Available to |
|---|---|---|
| `fetch_url` | `{ url: string }` — fetch a public HTTPS URL | Analyst, Researcher |

`fetch_url` runs through SSRF-guarded `lib/tools/fetch_url.js`:
- Rejects non-http(s) protocols, RFC1918 private IPv4, IPv6 loopback/ULA/link-local, `localhost`/`*.local`/`*.internal` hostnames.
- 8s timeout, 32KB max response, redirects not followed (manual mode — protects against SSRF-via-30x).
- HTML responses get text stripped before being returned to the agent.

Tool-use loop bounded to 3 turns per agent (configurable in `lib/agents/index.js`). The agent's `tool_turns` count is surfaced in the reading response.

## Observability

All errors logged to stderr with `[context]` prefix:
- `[runReading]` — orchestrator-level errors (synthesis failure, partial agent failures).
- `[runAllAgents]` — per-agent failure counts and reasons.
- `[runAgent <key>]` — single-agent classification warnings (malformed refusal, unknown target).
- `[synthesis]` — JSON parse failures, missing text blocks.
- `[inflateCachedReading <id>]` — corrupted cache row JSON.
- `[/api/<endpoint>]` — endpoint-level errors with stop_reason / status / etc.

Server error responses include a `remediation` field where a concrete next step exists (e.g., "set ANTHROPIC_API_KEY", "POST /api/snapshots first", "check your API key").

## Tests

```bash
npm test                                          # 83 tests, ~960ms
```

Coverage:
- Bounded-prompt composition + refusal validation (17 tests)
- Promise.allSettled error handling + synthesis fallbacks (13 tests)
- CLI shim timeout / stderr / serialization (6 tests)
- Orchestrator integration: 12-row insertion, partial failures, cache keying (9 tests)
- HTTP endpoint validation (6 tests)
- FTS5 retrieval + sync triggers (12 tests)
- Tool use + per-agent scoping + SSRF guards (12 tests)
- Refinement chain semantics (8 tests)

All tests use mocked Anthropic clients — no live API calls, no credential needed.
