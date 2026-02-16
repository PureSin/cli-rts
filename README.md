# cli-rts

Visualize AI coding agents as units in a real-time strategy game. Hooks into Claude Code's event system, translates sessions into players, subagents into units, and tool calls into unit actions — then renders it all as a live RTS in the browser.

## Goal

Watch your AI agents work like watching a StarCraft replay. Each Claude Code session is a player. Each subagent is a unit. File reads are scouting, edits are building, bash commands are attacks. The codebase is the map.

## Repo Structure

```
cli-rts/
├── capture/          # Event capture daemon — hooks into Claude Code, maintains game state
├── render/           # Browser-based RTS renderer (Phaser/PixiJS)
├── specs/            # Design specs (game state schema, hook-to-RTS mappings)
├── references/       # Analysis of existing hook projects in the ecosystem
└── PLAN.md           # Project plan, research sprints, risk tracking
```

### capture/

The backend. A CLI tool + HTTP daemon that:
- Installs async hooks into `.claude/settings.json`
- Reads hook events from stdin and forwards them to the daemon
- Maintains a live `GameState` object mapping hook events to RTS concepts
- Serves game state over HTTP and (eventually) WebSocket

### render/

The frontend. A browser-based RTS visualization that:
- Connects to the capture daemon
- Renders the codebase as a 2D map
- Animates units performing actions in real time
- Targets StarCraft Brood War-level visual fidelity (isometric 2D, pixel art)

### specs/

Design documents:
- `GAME-STATE-SPEC.md` — Full TypeScript interfaces for game state, hook-to-RTS mapping for all 14 event types, WebSocket protocol design

### references/

Ecosystem research — analysis of existing Claude Code hook projects and patterns that inform our architecture. See `PLAN.md` for summaries.
