# Liminal Sandbox — Backend API

JSON HTTP API. Localhost only. CORS open for any origin (TUI is expected to call from the same machine).

## Run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-api03-...        # or: claude setup-token
PORT=3000 npm start                               # default port 3000
```

If `ANTHROPIC_API_KEY` is unset and `claude` CLI is on PATH, the backend falls back to `claude -p`. CLI mode adds ~25–40s per agent and serializes calls (single-flight). API mode is what you want for live demos.

`GET /api/health` returns `{ ok: true, service: "liminal-sandbox", version: "0.1.0" }`. Use that for a startup probe.

## Data model

Three tables in `liminal.db` (SQLite, WAL mode, located next to `package.json` by default; override with `LIMINAL_DB`).

- `snapshots(id, timestamp, kind, text, label, archived)` — items dropped into the vault. `kind ∈ {meeting, decision, incident, paste}`. `archived = 1` hides from active vault but preserves history.
- `readings(id, timestamp, snapshot_ids, snapshot_count, signal_summary, threads, architect_view, witness_view, contrarian_view, model, client_mode)` — one full pass: synthesis + three bounded-agent reads.
- `corrections(id, reading_id, agent, tag, note, timestamp)` — user pushback on a specific agent's read in a reading. `agent ∈ {architect, witness, contrarian}`. `tag ∈ ` the canonical 9 (see `/api/tags`).

`readings.snapshot_ids` and `readings.threads` are stored as JSON strings in the DB but always returned as arrays in API responses.

## Endpoints

### `GET /api/health`

Simple liveness probe.

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
  "descriptions": {
    "wrong_frame": "The agent used the wrong lens entirely.",
    "wrong_intensity": "The reading was too strong or too weak.",
    "...": "..."
  }
}
```

### `GET /api/snapshots`

Active (non-archived) vault, oldest-first by timestamp.

```json
{
  "snapshots": [
    { "id": "...", "timestamp": 1714073280000, "kind": "meeting",
      "text": "1:1 with Maya — she said the team is asking what we are doing about Eric.",
      "label": "1:1 with Maya" }
  ]
}
```

### `POST /api/snapshots`

Drop a snapshot into the vault.

Request:
```json
{ "kind": "meeting|decision|incident|paste", "text": "<freeform>", "label": "<optional short name>" }
```

`kind` is required and must be one of the four values. `text` is required, no length cap enforced server-side, but synthesis truncates each snapshot at 800 chars.

Response:
```json
{ "ok": true, "snapshot": { "id": "...", "timestamp": ..., "kind": "...", "text": "...", "label": null } }
```

400 errors: missing kind/text, invalid kind.

### `DELETE /api/snapshots/:id`

Archive a single snapshot. Idempotent. Always returns 200 with `{ ok: <bool> }`. `ok: false` means no row matched.

### `POST /api/snapshots/clear`

Archive everything in the vault. Returns `{ ok: true }`. Past readings still reference these IDs but the vault appears empty.

### `POST /api/seed`

Demo helper. Clears the vault then drops 5 founder-flavored sample snapshots (cofounder friction, postponed offer, sleep note, missed standup, customer escalation). Returns `{ ok: true, count: 5 }`. Useful for the TUI's "Load demo" affordance.

### `POST /api/read`

Run a reading across the entire active vault. Synchronous — returns when all four model calls finish.

- API mode: ~5–10s for synthesis + three parallel agent calls.
- CLI mode: ~75–120s (calls serialize through a single-flight queue).

No request body required. Implicitly uses every active snapshot.

Response:
```json
{
  "reading_id": "...",
  "timestamp": 1714073280000,
  "snapshot_count": 5,
  "snapshot_ids": ["...", "..."],
  "signal_summary": "<one paragraph synthesis from Opus 4.7>",
  "threads": [
    { "label": "...", "snapshot_ids": ["..."], "summary": "..." }
  ],
  "architect":   { "name": "Architect",   "key": "architect",   "domain": "structure, not feeling",  "interpretation": "..." },
  "witness":     { "name": "Witness",     "key": "witness",     "domain": "felt, not strategic",    "interpretation": "..." },
  "contrarian":  { "name": "Contrarian",  "key": "contrarian",  "domain": "inversion, not balance", "interpretation": "..." },
  "model": "claude-opus-4-7",
  "client_mode": "api"
}
```

Errors: 400 if vault is empty (`vault is empty — drop at least one snapshot before reading`), 500 if no Anthropic credential or the model call fails.

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

Full reading + all corrections filed on it.

```json
{
  "reading_id": "...",
  "timestamp": ...,
  "snapshot_count": 5,
  "snapshot_ids": ["..."],
  "signal_summary": "...",
  "threads": [...],
  "architect": { "interpretation": "..." },
  "witness": { "interpretation": "..." },
  "contrarian": { "interpretation": "..." },
  "model": "...",
  "client_mode": "...",
  "corrections": [
    { "id": "...", "agent": "architect", "tag": "missed_compensation", "note": null, "timestamp": ... }
  ]
}
```

404 if the reading id is unknown.

### `POST /api/correction`

File a correction on a specific agent's read in a reading.

Request:
```json
{ "reading_id": "...", "agent": "architect|witness|contrarian", "tag": "<one of the 9>", "note": "<optional>" }
```

Response:
```json
{ "ok": true, "correction_id": "..." }
```

Errors: 400 missing fields, 400 bad agent, 400 invalid tag, 404 unknown reading_id.

Multiple corrections can be filed on the same `(reading_id, agent)` — they all stick. The TUI should show "applied" state by tracking which `(agent, tag)` pairs the user has clicked locally; the doctrine endpoint aggregates server-side.

### `GET /api/doctrine`

Aggregated correction stats. The "moat" view.

```json
{
  "by_agent_tag": [
    { "agent": "architect", "tag": "missed_compensation", "count": 5 },
    { "agent": "witness",   "tag": "too_generic",         "count": 3 }
  ],
  "by_agent": [
    { "agent": "architect", "count": 6 },
    { "agent": "witness",   "count": 3 }
  ],
  "total_readings": 4,
  "total_corrections": 11,
  "active_snapshots": 5
}
```

Use `by_agent_tag` for the bar list. The header chrome can show `total_readings`, `total_corrections`, `active_snapshots`.

## Conventions

- **IDs** are short base36 strings: `<timestamp>-<random>`. Treat as opaque.
- **Timestamps** are integer ms since epoch (`Date.now()`), UTC. Render with the user's local timezone.
- **All responses are JSON.** Errors come back as `{ "error": "<message>" }` with appropriate HTTP status. There is no error code field — the message is the contract.
- **No auth.** Localhost only. If you bind to non-localhost, add auth — there is none today.
- **No streaming.** `/api/read` returns one final JSON when all four model calls finish. If you want progressive paint in the TUI, fire `/api/read` and start an interval poll on `/api/readings?limit=1` — once the new reading_id appears, fetch its detail. Or just spin a "three reads in flight…" indicator until the response lands; that's the simpler path.

## Two-call Read pattern (recommended for TUI)

`POST /api/read` is the simplest. It blocks until done. Total time = synthesis + max(3 agent calls).

If your TUI wants per-agent paint-in (synthesis → architect → witness → contrarian, each appearing as it lands), the backend doesn't support that yet — call out and we'll add a streaming variant or a snapshot-then-poll split. Out of scope for tonight.
