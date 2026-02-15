# cli-rts

Turn Claude Code sessions into real-time RTS game state. Hooks into Claude Code's event system and maintains a live `game-state.json` that maps sessions to players, subagents to units, and tool calls to unit actions.

## Quick Start

```bash
npm install
npm run build
```

### 1. Install hooks

In your project directory:

```bash
node dist/cli.js init
```

This does two things:
- Adds 13 async hook entries to `.claude/settings.json` (idempotent — safe to run multiple times)
- Adds `.cli-rts/` to `.gitignore`

### 2. Start the daemon

```bash
node dist/cli.js start
```

The daemon listens on `http://127.0.0.1:4175` and writes game state to `.cli-rts/game-state.json` on every event.

Use `--port` to change the port:

```bash
node dist/cli.js start --port 5000
```

### 3. Use Claude Code normally

Once hooks are installed and the daemon is running, start a Claude Code session in the same project. Every hook event (tool calls, subagent spawns, session lifecycle) flows through automatically.

### 4. Read the game state

Poll the file:

```bash
cat .cli-rts/game-state.json
```

Or hit the HTTP API:

```bash
# Full game state
curl http://127.0.0.1:4175/state

# Health check
curl http://127.0.0.1:4175/health
```

## How It Works

```
Claude Code hook fires (async)
    │
    ▼
cli-rts emit <event>     ← reads JSON from stdin
    │
    ▼
POST http://127.0.0.1:4175/events
    │
    ▼
Daemon updates GameState → writes .cli-rts/game-state.json
```

The `emit` command always exits 0 and has a 3-second timeout, so it never blocks the agent — even if the daemon is down.

## Game State Model

| Hook Event | RTS Concept |
|---|---|
| `SessionStart` | Player joins, Commander unit spawns |
| `SessionEnd` | Player disconnects |
| `UserPromptSubmit` | Commander receives orders |
| `Stop` | All units go idle |
| `PreToolUse` | Unit begins action (Read=scouting, Edit=building, Bash=attacking) |
| `PostToolUse` | Unit completes action |
| `PostToolUseFailure` | Unit action failed |
| `SubagentStart` | New unit spawns (Explore=Scout, Bash=Warrior, Plan=Strategist) |
| `SubagentStop` | Unit despawns |
| `PermissionRequest` | Unit awaiting approval |
| `Notification` | Alert ping |
| `TaskCompleted` | Objective cleared |
| `PreCompact` | Context compacting |

## Manual Testing

Send mock events without Claude Code:

```bash
# Start daemon in one terminal
node dist/cli.js start

# In another terminal, simulate a session
echo '{"session_id":"s1","model":"claude-opus-4-6","cwd":"/my/project"}' \
  | node dist/cli.js emit session-start

echo '{"session_id":"s1","tool_name":"Read","tool_input":{"file_path":"/my/project/src/index.ts"},"tool_use_id":"t1"}' \
  | node dist/cli.js emit pre-tool

echo '{"session_id":"s1","agent_id":"a1","agent_type":"Explore"}' \
  | node dist/cli.js emit subagent-start

# Check the state
curl -s http://127.0.0.1:4175/state | python3 -m json.tool
```

## Project Structure

```
src/
├── cli.ts                  # Entry point: init, start, emit subcommands
├── commands/
│   ├── init.ts             # Installs hooks into .claude/settings.json
│   ├── start.ts            # HTTP server daemon
│   └── emit.ts             # Reads stdin, POSTs to daemon
├── game-state.ts           # Types + factory functions
└── event-handlers.ts       # Maps hook events → game state mutations
```
