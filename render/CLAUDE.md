# Render Layer: Browser-Based RTS Visualization

## Context

The capture daemon hooks into Claude Code, receives events via `cli-rts emit`, maintains `GameState` in memory, serves it at `GET /state`, and logs every event to `.cli-rts/event-log.jsonl`. The render package is a browser app that visualizes game state as a top-down 2D RTS.

**Stack:** PixiJS v8, Vite 6, TypeScript
**Visual style:** Top-down 2D, placeholder geometric shapes (colored circles/diamonds for units, rectangles for terrain)

## Modes

| Mode | Command | Description |
|------|---------|-------------|
| Live | `npm run dev` | Polls daemon at `http://127.0.0.1:4175/state` every 500ms |
| Fixture | `npm run dev:fixture -- path/to/game-state.json` | Loads a single state snapshot |
| Replay | `npm run dev:replay -- path/to/event-log.jsonl` | Scrubs through event log with timeline UI |

The Vite config detects the file extension (`.json` vs `.jsonl`) of the positional arg to select fixture vs replay mode. Each mode injects a global flag (`window.__FIXTURE_MODE__` or `window.__REPLAY_MODE__`) and serves the file at a dev middleware endpoint.

## Project Structure

```
render/
├── package.json                        # pixi.js + vite
├── tsconfig.json
├── vite.config.ts                      # fixture + replay Vite plugins
├── index.html
├── src/
│   ├── main.ts                         # Bootstrap: detects mode, wires state source + renderers
│   ├── types.ts                        # GameState types (copied from capture)
│   ├── config.ts                       # Daemon URL, poll interval, map dimensions
│   │
│   ├── state/
│   │   ├── StateSync.ts                # Live/fixture: polls GET /state, emits on tick change
│   │   └── ReplaySync.ts              # Replay: holds event array, seek/play/pause/speed
│   │
│   ├── assets/
│   │   ├── AssetManifest.ts            # Interface: what an asset pack must provide
│   │   ├── AssetLoader.ts              # Resolves sprite keys → textures/graphics
│   │   └── packs/
│   │       └── placeholder/
│   │           └── manifest.json       # Colored shapes: circle=commander, diamond=scout, etc.
│   │
│   ├── core/
│   │   ├── GameLoop.ts                 # rAF loop with delta time
│   │   └── Camera.ts                   # Pan (drag) + zoom (scroll wheel)
│   │
│   ├── renderer/
│   │   ├── MapRenderer.ts              # Terrain regions as colored rectangles
│   │   ├── MapOverlay.ts               # HTML labels for map regions (crisp at any zoom)
│   │   ├── UnitRenderer.ts             # Unit display: shape + color ring + status indicator
│   │   ├── UnitPool.ts                 # Create/update/remove unit display objects by ID
│   │   └── UnitLabelOverlay.ts         # HTML labels for units (crisp at any zoom)
│   │
│   ├── ui/
│   │   └── ReplayControls.ts           # Replay mode: slider, play/pause, speed, event label
│   │
│   └── utils/
│       ├── RegionSanitizer.ts          # Cleans messy region IDs → displayable labels
│       └── ColorUtils.ts               # PlayerColor→hex, TerrainType→fill color
```

## Key Architecture Decisions

1. **HTML overlays for UI, PixiJS for the game world.** HTML is better for text, scrolling, layout. PixiJS handles sprite/shape rendering. Canvas fills viewport, HTML divs positioned on top with `pointer-events:none`.

2. **Types copied, not shared.** `render/` and `capture/` are independent packages. ~145 lines of types copied to avoid monorepo complexity. HTTP/JSON is the contract boundary.

3. **State diffing in the renderer.** Renderer compares new state to previous state to detect changes (new units, moved units, removed units). Daemon stays simple.

4. **Replay uses full state snapshots.** Each JSONL line includes the complete `GameState` at that point. The render layer can seek to any event with O(1) cost — no need to replay game logic. Typical log size is 1-10MB.

5. **Region sanitization at render layer.** Region IDs from the daemon can be messy paths. Renderer sanitizes labels for display; raw IDs remain as keys.

## Replay Mode Details

**Event log format** (one JSON object per line):
```
{"seq":1,"ts":1700000000000,"eventType":"session-start","payload":{...},"state":{...}}
```

**ReplaySync** exposes:
- `seek(index)` — jump to any event, emit state to listeners
- `play()` / `pause()` — auto-advance using original timestamp deltas
- `setSpeed(multiplier)` — 0.5x, 1x, 2x, 4x
- `getState()` / `onChange()` — same interface as StateSync

**ReplayControls** renders a fixed-bottom bar with range slider, play/pause, speed toggle, and current event type label.
