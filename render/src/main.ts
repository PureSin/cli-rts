import { Application } from "pixi.js";
import { StateSync } from "./state/StateSync.js";
import { ReplaySync, type EventEntry } from "./state/ReplaySync.js";
import { ReplayControls } from "./ui/ReplayControls.js";
import { EventLog } from "./ui/EventLog.js";
import { GameLoop } from "./core/GameLoop.js";
import { Camera } from "./core/Camera.js";
import { MapRenderer } from "./renderer/MapRenderer.js";
import { MapOverlay } from "./renderer/MapOverlay.js";
import { UnitPool } from "./renderer/UnitPool.js";
import { UnitLabelOverlay } from "./renderer/UnitLabelOverlay.js";

declare global {
  interface Window {
    __REPLAY_MODE__?: boolean;
  }
}

async function loadReplayEntries(): Promise<EventEntry[]> {
  const res = await fetch("/__replay/events.jsonl");
  if (!res.ok) throw new Error(`Failed to load replay: HTTP ${res.status}`);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EventEntry);
}

async function init() {
  // Create PixiJS application
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x0a0a0f,
    antialias: true,
  });

  const gameDiv = document.getElementById("game")!;
  gameDiv.appendChild(app.canvas);

  // Force canvas behind HTML overlays
  const canvas = app.canvas as HTMLCanvasElement;
  canvas.style.position = "absolute";
  canvas.style.zIndex = "0";

  // HTML overlay container — sits above canvas
  // pointer-events:none so camera drag/zoom goes through to canvas
  const overlayContainer = document.createElement("div");
  overlayContainer.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:hidden;user-select:text;";
  gameDiv.appendChild(overlayContainer);

  // Camera (pan + zoom)
  const camera = new Camera(canvas);
  app.stage.addChild(camera.world);

  // Renderers
  const mapRenderer = new MapRenderer();
  const unitPool = new UnitPool();

  camera.world.addChild(mapRenderer.container);
  camera.world.addChild(unitPool.container);

  // HTML overlays for crisp text at any zoom
  const mapOverlay = new MapOverlay();
  const unitLabelOverlay = new UnitLabelOverlay();
  overlayContainer.appendChild(mapOverlay.el);
  overlayContainer.appendChild(unitLabelOverlay.el);
  unitPool.setLabelOverlay(unitLabelOverlay);

  // Event log panel (right side)
  const eventLog = new EventLog();
  document.getElementById("ui-overlay")!.appendChild(eventLog.el);

  // Center camera on map
  camera.centerOn(500, 500);

  // Determine mode and create appropriate state source
  const isReplay = !!window.__REPLAY_MODE__;
  let stateSource: StateSync | ReplaySync;

  if (isReplay) {
    const entries = await loadReplayEntries();
    const replaySync = new ReplaySync(entries);
    stateSource = replaySync;

    // Replay controls UI
    const controls = new ReplayControls(replaySync);
    document.getElementById("ui-overlay")!.appendChild(controls.el);

    replaySync.onChange((state) => {
      mapRenderer.update(state);
      mapOverlay.update(state);
      unitPool.syncUnits(state);
      eventLog.update(state);
    });
    replaySync.start();
  } else {
    const stateSync = new StateSync();
    stateSource = stateSync;

    stateSync.onChange((state) => {
      mapRenderer.update(state);
      mapOverlay.update(state);
      unitPool.syncUnits(state);
      eventLog.update(state);
    });
    stateSync.start();
  }

  // Game loop — interpolate units each frame, sync overlays with camera
  const gameLoop = new GameLoop((dt) => {
    unitPool.update(dt);

    // Sync HTML overlays with camera transform
    mapOverlay.syncCamera(camera.worldX, camera.worldY, camera.zoom);
    unitLabelOverlay.syncCamera(camera.worldX, camera.worldY, camera.zoom);

    // Update event log header with connection status
    const state = stateSource.getState();
    if (stateSource.connected && state) {
      const playerCount = Object.keys(state.players).length;
      if (stateSource instanceof ReplaySync) {
        const cursor = stateSource.getCursor();
        const total = stateSource.getLength();
        eventLog.setStatus(`replay ${cursor + 1}/${total} · tick ${state.tick} · ${playerCount}p`, "#4af");
      } else if (stateSource.isFixture()) {
        eventLog.setStatus(`fixture · tick ${state.tick} · ${playerCount}p`, "#cc4");
      } else {
        eventLog.setStatus(`tick ${state.tick} · ${playerCount}p`, "#4f4");
      }
    } else {
      eventLog.setStatus("disconnected", "#f44");
    }
  });
  gameLoop.start();
}

init().catch(console.error);
