import { Application } from "pixi.js";
import type { GameState } from "./types.js";
import { DEFAULT_PACK } from "./config.js";
import { loadPack } from "./assets/AssetLoader.js";

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
import { StateSync } from "./state/StateSync.js";
import { ReplaySync, type EventEntry } from "./state/ReplaySync.js";
import { ReplayControls } from "./ui/ReplayControls.js";
import { CommanderTooltip } from "./ui/CommanderTooltip.js";
import { CommanderToast } from "./ui/CommanderToast.js";
import { EventLog } from "./ui/EventLog.js";
import { Legend } from "./ui/Legend.js";
import { TimelineControls } from "./ui/TimelineControls.js";
import { GameLoop } from "./core/GameLoop.js";
import { Camera } from "./core/Camera.js";
import { MapRenderer } from "./renderer/MapRenderer.js";
import { MapOverlay } from "./renderer/MapOverlay.js";
import { UnitPool } from "./renderer/UnitPool.js";
import { UnitLabelOverlay } from "./renderer/UnitLabelOverlay.js";
import { PackSelector } from "./ui/PackSelector.js";

declare global {
  interface Window {
    __REPLAY_MODE__?: boolean;
    __rts_applyState?: (state: GameState) => void;
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
  // Load assets (allow URL override via ?pack=name)
  const params = new URLSearchParams(window.location.search);
  const packName = params.get("pack") || DEFAULT_PACK;
  await loadPack(packName);

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

  // Forward wheel events from the HTML overlay layer to the camera so zoom
  // still works when the pointer is over selectable text elements.
  overlayContainer.addEventListener("wheel", (e) => camera.onWheel(e), { passive: false });

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

  // Right panel: [timeline strip | event log] — positioned as a unit so they
  // stay connected when EventLog is resized.
  const rightPanel = document.createElement("div");
  rightPanel.style.cssText = [
    "position:fixed",
    "top:8px",
    "right:8px",
    "max-height:calc(100vh - 16px)",
    "display:flex",
    "flex-direction:row",
    "z-index:10",
  ].join(";");

  const timeline = new TimelineControls();
  const eventLog = new EventLog();
  rightPanel.appendChild(timeline.el);
  rightPanel.appendChild(eventLog.el);
  document.getElementById("ui-overlay")!.appendChild(rightPanel);

  const legend = new Legend();
  document.getElementById("ui-overlay")!.appendChild(legend.el);

  const commanderTooltip = new CommanderTooltip();
  document.getElementById("ui-overlay")!.appendChild(commanderTooltip.el);
  unitPool.setTooltip(commanderTooltip);

  const commanderToast = new CommanderToast();
  document.getElementById("ui-overlay")!.appendChild(commanderToast.el);
  unitPool.setToast(commanderToast);

  const packSelector = new PackSelector(packName);
  document.getElementById("ui-overlay")!.appendChild(packSelector.el);

  // Center camera on map
  camera.centerOn(500, 500);

  // Push renderers to a given state — shared by all modes and exposed for testing
  const applyState = (state: GameState) => {
    mapRenderer.update(state);
    mapOverlay.update(state);
    unitPool.syncUnits(state);
    eventLog.update(state);
  };
  window.__rts_applyState = applyState;

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

    replaySync.onChange(applyState);
    replaySync.start();
  } else {
    const stateSync = new StateSync();
    stateSource = stateSync;

    let scrubbing = false;

    stateSync.onChange((state) => {
      if (scrubbing) return;
      applyState(state);
      timeline.notifyLiveUpdate(state.eventLog.length);
    });

    timeline.onScrub((historicalState, idx, total, ts) => {
      scrubbing = true;
      mapRenderer.resetTick();
      applyState(historicalState);
      timeline.notifyLiveUpdate(total);
      eventLog.setTime(formatTs(ts));
    });

    timeline.onLive(() => {
      scrubbing = false;
      eventLog.setTime("");
      const current = stateSync.getState();
      if (current) {
        mapRenderer.resetTick();
        applyState(current);
      }
    });

    stateSync.start();
    timeline.start();
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
      const players = Object.values(state.players);
      const activePlayers = players.filter(p => p.status === "active" || p.status === "idle").length;
      const totalPlayers = players.length;
      const playerStr = `${activePlayers} active/${totalPlayers}p`;
      if (stateSource instanceof ReplaySync) {
        const cursor = stateSource.getCursor();
        const total = stateSource.getLength();
        eventLog.setStatus(`replay ${cursor + 1}/${total} · tick ${state.tick} · ${playerStr}`, "#4af");
      } else if (stateSource.isFixture()) {
        eventLog.setStatus(`fixture · tick ${state.tick} · ${playerStr}`, "#cc4");
      } else {
        eventLog.setStatus(`tick ${state.tick} · ${playerStr}`, "#4f4");
      }
    } else {
      eventLog.setStatus("disconnected", "#f44");
    }
  });
  gameLoop.start();
}

init().catch(console.error);
