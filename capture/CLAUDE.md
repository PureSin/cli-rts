# Capture Daemon: Event Capture + Game State

## Context

A CLI tool that hooks into Claude Code's event system and maintains a live RTS game state. Sessions become players, subagents become units, tool calls become unit actions.

## Commands

| Command | Description |
|---------|-------------|
| `cli-rts init` | Installs async hooks into `.claude/settings.json` |
| `cli-rts start` | Starts HTTP daemon on port 4175 |
| `cli-rts emit <EventType>` | Reads stdin JSON, POSTs to daemon (called by hooks) |

## Daemon Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/events` | Receive hook events, mutate game state, append to event log |
| `GET` | `/events` | Serve full event log (`application/x-ndjson`) |
| `GET` | `/state` | Current game state snapshot (JSON) |
| `GET` | `/health` | Health check |

## File Structure

```
capture/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                  # Entry point: init, start, emit subcommands
│   ├── commands/
│   │   ├── init.ts             # Reads/merges hooks into .claude/settings.json
│   │   ├── start.ts            # HTTP daemon, writes game-state.json + event-log.jsonl
│   │   └── emit.ts             # Reads stdin, POSTs to daemon (called by hooks)
│   ├── game-state.ts           # GameState types + factory
│   └── event-handlers.ts       # Maps hook events → game state mutations
```

## Output Files

Written to `.cli-rts/` in the working directory:

- **`game-state.json`** — Current game state snapshot, overwritten on every event
- **`event-log.jsonl`** — Append-only log of every event with full state snapshots

### Event Log Format

One JSON object per line:
```json
{"seq":1,"ts":1700000000000,"eventType":"session-start","payload":{...},"state":{...}}
```

- `seq` — Monotonically increasing sequence number (1-based)
- `ts` — Unix timestamp in milliseconds
- `eventType` — The hook event type (e.g. `session-start`, `pre-tool`, `subagent-start`)
- `payload` — Raw payload from the hook
- `state` — Full `GameState` snapshot after applying the event

The render layer uses this log for replay mode — each line contains enough data to render the full game state at that point without replaying events.

## Design Decisions

- **Port 4175** — avoids common ports (3000, 4000, 5173, 8080)
- **`.cli-rts/` directory** — game state + event log, gitignored
- **Always exit 0 in emit** — never block the agent, even if daemon is down
- **No database** — in-memory state, JSON file written on every update
- **Queued writes** — state file and event log writes are chained on a single promise to prevent races
- **`__cli_rts` marker** — hook entries tagged for idempotent init
