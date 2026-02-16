# Render Layer: Browser-Based RTS Visualization

## Context

The capture daemon (Sprint 1) is complete — it hooks into Claude Code, receives events via `cli-rts emit`, maintains `GameState` in memory, and serves it at `GET http://localhost:4175/state`. The `render/` folder is empty. We need a browser app that polls the daemon and renders the game state as a top-down 2D RTS visualization.

**Decisions made:**
- Top-down 2D (not isometric)
- PixiJS v8 (not Phaser 3) — lightweight WebGL renderer, ~150KB, more flexible
- Placeholder shapes first — colored geometric shapes for units, colored rectangles for terrain

## Project Structure

```
render/
├── package.json                        # pixi.js + vite
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts                         # Bootstrap: PixiJS app, state sync, game loop
│   ├── types.ts                        # GameState types (copied from capture)
│   ├── config.ts                       # Daemon URL, poll interval, map dimensions
│   │
│   ├── state/
│   │   └── StateSync.ts                # Polls GET /state, emits changes on tick diff
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
│   │   ├── MapRenderer.ts              # Terrain regions as colored rectangles with labels
│   │   ├── UnitRenderer.ts             # Unit display: shape + color ring + status indicator
│   │   ├── UnitPool.ts                 # Create/update/remove unit display objects by ID
│   │   └── MinimapRenderer.ts          # Corner overview with viewport indicator
│   │
│   ├── ui/
│   │   ├── EventFeed.ts                # HTML overlay: scrolling event log (bottom-right)
│   │   ├── PlayerPanel.ts              # HTML overlay: player stats (top-left)
│   │   └── StatusBar.ts                # Connection status + tick counter (top bar)
│   │
│   └── utils/
│       ├── RegionSanitizer.ts          # Cleans messy region IDs → displayable labels
│       └── ColorUtils.ts               # PlayerColor→hex, TerrainType→fill color
```

## Key Architecture Decisions

1. **HTML overlays for UI, PixiJS for the game world.** HTML is better for text, scrolling, layout. PixiJS handles sprite/shape rendering. Canvas fills viewport, HTML divs positioned on top.

2. **Types copied, not shared.** `render/` and `capture/` are independent packages. ~140 lines of types copied to avoid monorepo complexity. HTTP/JSON is the contract boundary.

3. **State diffing in the renderer.** Renderer compares new state to previous state to detect changes (new units, moved units, removed units). Daemon stays simple.

4. **Placeholder pack ships first.** Entire rendering pipeline works with programmatic PixiJS `Graphics`. Real sprite assets are a visual upgrade, not an architectural change.

5. **Region sanitization at render layer.** Example data has messy region IDs (JSON blobs, shell commands). Renderer sanitizes labels for display; IDs remain as keys.

## Phase 1: Get Anything Rendering

### Files to create (in order):

**1. Project scaffold**
- `render/package.json` — deps: `pixi.js@^8`, devDeps: `vite@^6`, `typescript@^5.7`
- `render/tsconfig.json` — ES2022, Bundler moduleResolution, strict, DOM lib
- `render/vite.config.ts` — dev server port 5175, outDir dist
- `render/index.html` — `<div id="game">` + `<div id="ui-overlay">`, full viewport, black bg

**2. Types and config**
- `render/src/types.ts` — Copy interfaces from `capture/src/game-state.ts` (lines 5-147)
- `render/src/config.ts` — `DAEMON_URL`, `POLL_INTERVAL_MS`, `MAP_WIDTH/HEIGHT`

**3. State sync**
- `render/src/state/StateSync.ts` — Polls `GET /state` every 500ms, compares tick numbers, notifies listeners on change

**4. Utilities**
- `render/src/utils/RegionSanitizer.ts` — Clean messy region IDs
- `render/src/utils/ColorUtils.ts` — PlayerColor→hex, TerrainType→fill color

**5. Asset abstraction (placeholder only)**
- `render/src/assets/AssetManifest.ts` — Interface
- `render/src/assets/packs/placeholder/manifest.json` — Shape definitions
- `render/src/assets/AssetLoader.ts` — Generates PixiJS Graphics from manifest

**6. Core systems**
- `render/src/core/GameLoop.ts` — rAF loop with delta time
- `render/src/core/Camera.ts` — Pan + zoom

**7. Renderers**
- `render/src/renderer/MapRenderer.ts` — Terrain regions as colored rectangles
- `render/src/renderer/UnitPool.ts` — Manage unit display objects
- `render/src/renderer/UnitRenderer.ts` — Unit visuals

**8. Bootstrap**
- `render/src/main.ts` — Wire it all together

## Verification

1. `cd render && npm install && npm run dev` — dev server starts on 5175
2. `cd capture && npm run dev -- start` — daemon on 4175
3. Open `http://localhost:5175` — see map regions and units from live state
4. `curl -X POST http://localhost:4175/events -d '{"eventType":"SessionStart","payload":{"session_id":"test1","cwd":"/tmp","model":"test"}}' -H 'Content-Type: application/json'` — verify unit appears
