# cli-rts

Visualize Claude Code AI agents as units in a real-time strategy game. Hooks into Claude Code's event system, translates sessions into players, subagents into units, and tool calls into unit actions — then renders it all as a live top-down 2D RTS in the browser (PixiJS v8).

## Repo Structure

```
cli-rts/
├── capture/          # Event capture daemon — hooks into Claude Code, maintains game state, serves HTTP
├── render/           # Browser-based RTS renderer (PixiJS v8, Vite 6)
├── specs/            # Design specs (game state schema, hook-to-RTS mappings)
├── references/       # Analysis of existing Claude Code hook projects
├── setup.sh          # One-shot setup: builds capture, installs hooks (optionally installs peon-ping)
├── PLAN.md           # Project plan, research sprints, risk tracking
└── README.md
```

## Starting the Servers

Two processes need to run: the **capture daemon** and the **render dev server**.

### 1. Capture Daemon (port 4175)

```bash
# From the repo root
npx --prefix capture tsx src/cli.ts start
```

Or after building:

```bash
cd capture && npm run build
node capture/dist/cli.js start
```

The daemon exposes:
- `POST /events` — receives hook events from `cli-rts emit`
- `GET /events` — full event log (JSONL)
- `GET /state` — current game state snapshot
- `GET /health` — health check

### 2. Render Dev Server (port 5175)

```bash
# Live mode — polls daemon every 500ms
cd render && npm run dev
# Open http://localhost:5175
```

**Alternative render modes:**

```bash
# Fixture mode — view a saved game-state.json snapshot
cd render && npm run dev:fixture -- path/to/game-state.json

# Replay mode — scrub through a recorded event log
cd render && npm run dev:replay -- path/to/event-log.jsonl
```

## First-Time Setup

### Option A: One-shot script (from repo root)

```bash
./setup.sh           # Build capture, install hooks into current project's .claude/settings.json
./setup.sh --sound   # Same, plus install peon-ping for audio notifications
```

### Option B: Manual

```bash
# 1. Build capture
cd capture && npm install && npm run build && cd ..

# 2. Install hooks into your target project's .claude/settings.json
node capture/dist/cli.js init

# 3. Install render dependencies
cd render && npm install
```

## Output Files

The daemon writes to `.cli-rts/` in the working directory:
- `game-state.json` — current game state, overwritten on every event
- `event-log.jsonl` — append-only log of every event with full state snapshots (used for replay mode)

## Key Ports

| Service | Port |
|---------|------|
| Capture daemon | 4175 |
| Render dev server | 5175 |
