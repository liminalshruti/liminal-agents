# Liminal Sandbox — backend

Three bounded agents read snapshots of your work. They disagree. Your correction is the data.

This repo is the **backend service** for the Liminal sandbox. It exposes a JSON HTTP API that a separate TUI consumes. There is no web UI in this repo — the TUI lives elsewhere.

Built for the AI Agent Economy Hackathon (Apr 25, 2026).

## What it does

- Accepts **snapshots** of a founder's work (meeting notes, decisions, incidents, hard messages) into a local vault.
- On request, **synthesizes** across the active vault into one paragraph + up to 3 threads (Opus 4.7), then runs **three bounded agents** — Architect, Witness, Contrarian — over the synthesis. Each produces a short, declarative read in its own bounded domain.
- Captures **corrections** the user files against any of the three reads, using a frozen 9-tag canonical taxonomy.
- Aggregates corrections into a **doctrine** view — the user's evolving record of what the agents keep missing.

The agents do not read prior corrections. The record is the moat.

## Run

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-api03-...        # preferred
# or:
claude setup-token                                # falls back to `claude -p`
npm start                                         # default port 3000
```

`GET /api/health` confirms it is up.

## Layout

```
bin/
  server.js               # Hono HTTP server (no static; backend only)
  cli.js                  # local CLI: drop, list, read, seed, clear
lib/
  agents/
    architect.js          # bounded prompt: structure, not feeling
    witness.js            # bounded prompt: felt, not strategic
    contrarian.js         # bounded prompt: inversion, not balance
    index.js              # runAllAgents() — parallel three-agent call
  anthropic-client.js     # API key path with claude -p fallback
  anthropic-cli-shim.js   # single-flight `claude -p` queue
  auth.js
  correction-tags.js      # 9 canonical tags, frozen
  db.js                   # better-sqlite3, 3 tables
  orchestrator.js         # runReading(): synthesize → 3 agents → write
  synthesis.js            # synthesizeAcrossSnapshots() (Opus 4.7)
  seed.js                 # 5-snapshot demo vault for hackathon prep
API.md                    # full endpoint reference for the TUI
```

## API surface

See [`API.md`](./API.md) for full schema and examples. Summary:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/tags` | canonical correction tags + descriptions |
| GET | `/api/snapshots` | list active vault |
| POST | `/api/snapshots` | drop a snapshot |
| DELETE | `/api/snapshots/:id` | archive one |
| POST | `/api/snapshots/clear` | archive all |
| POST | `/api/seed` | clear + load 5 demo snapshots |
| POST | `/api/read` | synthesize + run three agents over active vault |
| GET | `/api/readings` | recent readings, newest-first |
| GET | `/api/readings/:id` | full reading + corrections |
| POST | `/api/correction` | file a correction on a reading's agent |
| GET | `/api/doctrine` | aggregated correction stats |

## CLI (for backend dev only — TUI is separate)

```bash
node bin/cli.js drop --kind=meeting --label="1:1 Maya" "She said the team is asking..."
node bin/cli.js list
node bin/cli.js seed              # load demo vault
node bin/cli.js read              # one full reading to stdout
node bin/cli.js clear
```

## Stack

Node 20+ ESM, Hono, better-sqlite3, Anthropic SDK with `claude -p` fallback. No web framework, no UI library, no auth. Localhost only.

## License

MIT.
