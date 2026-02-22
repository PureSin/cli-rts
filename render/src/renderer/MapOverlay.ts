import type { GameState, MapRegion } from "../types.js";

/**
 * HTML overlay for region labels and file lists.
 * Renders as DOM text so it stays crisp at any zoom level.
 * A single container div is CSS-transformed to match the PixiJS camera.
 */
export class MapOverlay {
  readonly el: HTMLDivElement;
  private lastTick = -1;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText = "transform-origin:0 0;will-change:transform;";
  }

  /** Call every frame to keep in sync with the camera */
  syncCamera(worldX: number, worldY: number, zoom: number) {
    this.el.style.transform = `translate(${worldX}px,${worldY}px) scale(${zoom})`;
  }

  /** Rebuild DOM when game state changes */
  update(state: GameState) {
    if (state.tick === this.lastTick) return;
    this.lastTick = state.tick;
    this.rebuild(state);
  }

  private rebuild(state: GameState) {
    this.el.innerHTML = "";

    // Collect active files per region
    const activeByRegion = new Map<string, Set<string>>();
    for (const player of Object.values(state.players)) {
      for (const unit of [player.commander, ...Object.values(player.units)]) {
        if (unit.currentAction) {
          const regionId = unit.position.region;
          const fname = unit.currentAction.target.split("/").pop();
          if (fname) {
            let set = activeByRegion.get(regionId);
            if (!set) {
              set = new Set();
              activeByRegion.set(regionId, set);
            }
            set.add(fname);
          }
        }
      }
    }

    for (const region of Object.values(state.map.regions)) {
      this.buildRegionEl(region, activeByRegion.get(region.id));
    }
  }

  private buildRegionEl(region: MapRegion, activeFiles?: Set<string>) {
    const { x, y, width, height } = region.bounds;
    if (width < 30 || height < 16) return;

    const isLeaf = region.children.length === 0;

    // Region label
    const labelEl = document.createElement("div");
    labelEl.style.cssText =
      `position:absolute;left:${x + 5}px;top:${y + 2}px;` +
      `max-width:${width - 10}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` +
      `font-family:'Courier New',monospace;font-weight:bold;color:#fff;` +
      `font-size:${isLeaf ? 13 : 16}px;opacity:${isLeaf ? 0.85 : 1};` +
      `pointer-events:auto;cursor:text;`;
    labelEl.textContent = region.label;
    this.el.appendChild(labelEl);

    // File list in leaf regions
    const files = region.files;
    if (!isLeaf || !files || files.length === 0 || width < 60 || height < 40) return;

    const lineHeight = 12;
    const maxFiles = Math.floor((height - 28) / lineHeight);
    const listEl = document.createElement("div");
    listEl.style.cssText =
      `position:absolute;left:${x + 6}px;top:${y + 20}px;width:${width - 12}px;overflow:hidden;` +
      `font-family:'Courier New',monospace;font-size:9px;line-height:${lineHeight}px;` +
      `pointer-events:auto;cursor:text;`;

    for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
      const fname = files[i];
      const isActive = activeFiles?.has(fname) ?? false;
      const fileEl = document.createElement("div");
      fileEl.textContent = fname;
      fileEl.style.cssText = `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
        `color:${isActive ? "#fff" : "#aaa"};opacity:${isActive ? "1" : "0.85"};`;
      listEl.appendChild(fileEl);
    }

    this.el.appendChild(listEl);
  }
}
