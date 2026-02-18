# cli-rts

Visualize AI coding agents as units in a real-time strategy game. Hooks into Claude Code's event system, translates sessions into players, subagents into units, and tool calls into unit actions — then renders it all as a live RTS in the browser.

## Goal

Watch your AI agents work like watching a StarCraft replay. Each Claude Code session is a player. Each subagent is a unit. File reads are scouting, edits are building, bash commands are attacks. The codebase is the map.

## Quick Start

```bash
# 1. Install hooks into your project
cd your-project
cli-rts init

# 2. Start the capture daemon (run from the project root so it knows the repo path)
npx --prefix capture tsx src/cli.ts start

# 3. Live view — polls daemon for state updates
cd render && npm run dev
# Open http://localhost:5175

# 4. Fixture mode — render a saved game-state.json snapshot
cd render && npm run dev:fixture -- path/to/game-state.json

# 5. Replay mode — scrub through a recorded event log
cd render && npm run dev:replay -- path/to/event-log.jsonl
```

## Repo Structure

```
cli-rts/
├── capture/          # Event capture daemon — hooks into Claude Code, maintains game state
├── render/           # Browser-based RTS renderer (PixiJS v8)
├── specs/            # Design specs (game state schema, hook-to-RTS mappings)
├── references/       # Analysis of existing hook projects in the ecosystem
└── PLAN.md           # Project plan, research sprints, risk tracking
```

### capture/

The backend. A CLI tool + HTTP daemon that:
- Installs async hooks into `.claude/settings.json` (`cli-rts init`)
- Reads hook events from stdin and forwards them to the daemon (`cli-rts emit`)
- Maintains a live `GameState` object mapping hook events to RTS concepts
- Writes every event + state snapshot to `.cli-rts/event-log.jsonl` for replay
- Serves game state and event log over HTTP

**Daemon endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/events` | Receive hook events |
| `GET` | `/events` | Full event log (JSONL) |
| `GET` | `/state` | Current game state snapshot |
| `GET` | `/health` | Health check |

### render/

The frontend. A browser-based top-down 2D RTS visualization (PixiJS v8) that:
- **Live mode** — polls the capture daemon, renders units and map in real time
- **Fixture mode** — loads a single `game-state.json` snapshot for static viewing
- **Replay mode** — loads an `event-log.jsonl`, provides a timeline slider to scrub through events with play/pause and speed controls (0.5x, 1x, 2x, 4x)

### specs/

Design documents:
- `GAME-STATE-SPEC.md` — Full TypeScript interfaces for game state, hook-to-RTS mapping for all 14 event types

### references/

Ecosystem research — analysis of existing Claude Code hook projects and patterns that inform the architecture.
