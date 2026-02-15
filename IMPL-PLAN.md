# Implementation Plan: cli-rts install + game state output

## Context

First buildable piece of cli-rts: a CLI tool that installs hooks into a project's `.claude/settings.json`, and a daemon that receives hook events and writes a `game-state.json` file for a future visualization layer to consume.

## Approach

**Language:** TypeScript/Node.js
**Two commands:** `cli-rts init` (install hooks) and `cli-rts start` (run daemon)
**Hook→daemon IPC:** `cli-rts emit <event>` reads stdin JSON, POSTs to daemon at `http://localhost:4175/events`
**Output:** `.cli-rts/game-state.json` updated on every event

## File Structure

```
src/
├── cli.ts                      # Entry point: init, start, emit subcommands
├── commands/
│   ├── init.ts                 # Reads/merges hooks into .claude/settings.json
│   ├── start.ts                # Starts HTTP server daemon, writes game-state.json
│   └── emit.ts                 # Reads stdin, POSTs to daemon (called by hooks)
├── game-state.ts               # GameState types + update logic
└── event-handlers.ts           # Maps hook events → game state mutations
```

## Tasks

- [ ] **1. Initialize Node.js project**
  - `package.json` with `"type": "module"`, typescript, `tsx` for dev
  - Minimal deps: `commander` for CLI parsing, Node built-in `http` for server
  - `bin` field: `{ "cli-rts": "./dist/cli.js" }`
  - `tsconfig.json` targeting ES2022/NodeNext

- [ ] **2. Implement `cli-rts init`** (`src/commands/init.ts`)
  - Read `.claude/settings.json` (or create it if missing)
  - Merge hook entries for all 13 event types without clobbering existing hooks
  - Each hook: `{ "type": "command", "command": "cli-rts emit <EventType>", "async": true }`
  - Use `"__cli_rts": true` marker in hook entries so we can identify/update them later
  - Add `.cli-rts/` to `.gitignore` if not already present

- [ ] **3. Implement `cli-rts emit <event-type>`** (`src/commands/emit.ts`)
  - Read JSON from stdin (hook payload from Claude Code)
  - POST to `http://localhost:4175/events` with `{ eventType, payload }` wrapper
  - 3-second timeout, always exit 0 (never block the agent)
  - If daemon not running, silently fail

- [ ] **4. Implement `cli-rts start`** (`src/commands/start.ts`)
  - Start HTTP server on port 4175
  - `POST /events` — receive events, update game state, write `.cli-rts/game-state.json`
  - `GET /state` — return current game state JSON
  - Maintain `GameState` in memory
  - Create `.cli-rts/` directory if needed

- [ ] **5. Implement game state types** (`src/game-state.ts`)
  - Port TypeScript interfaces from `GAME-STATE-SPEC.md`:
    `GameState`, `Player`, `Unit`, `UnitAction`, `MapPosition`, `GameEvent`
  - Simplified `GameMap` — just track regions as directories from events
  - Factory function to create empty initial state

- [ ] **6. Implement event handlers** (`src/event-handlers.ts`)
  - `SessionStart` → create Player + Commander unit
  - `SessionEnd` → mark Player disconnected
  - `UserPromptSubmit` → update Commander status to "acting"
  - `Stop` → mark all units idle
  - `PreToolUse` → set unit's currentAction + position (extract file path from tool_input)
  - `PostToolUse` → clear currentAction, mark idle
  - `PostToolUseFailure` → mark unit "failed"
  - `SubagentStart` → spawn new Unit under Player (type from agent_type)
  - `SubagentStop` → despawn Unit
  - `PermissionRequest` → mark unit "waiting"
  - `Notification` → add to event log
  - `TaskCompleted` → update objectives
  - `PreCompact` → add to event log

- [ ] **7. Wire up CLI entry point** (`src/cli.ts`)
  - Use `commander` to register `init`, `start`, `emit` subcommands
  - Add `--port` flag to `start` (default 4175)

- [ ] **8. Verify end-to-end**
  - `cli-rts init` → `.claude/settings.json` has all 13 hook entries
  - `cli-rts start` → daemon starts, creates `.cli-rts/game-state.json`
  - Pipe mock events via `echo '...' | cli-rts emit SessionStart` → game-state.json updates
  - `curl http://localhost:4175/state` → returns current game state

## Design Decisions

- **Port 4175** — avoids common ports (3000, 4000, 5173, 8080)
- **`.cli-rts/` directory** — game state + daemon files, gitignored
- **Always exit 0 in emit** — never block the agent, even if daemon is down
- **No database** — in-memory state, JSON file written on every update
- **Simplified map** — track regions as directories from events, no spatial layout (Sprint 2)
- **Marker tag** — `"__cli_rts": true` in hook entries for idempotent init
