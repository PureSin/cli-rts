import { Container, Graphics } from "pixi.js";
import type { GameState, MapRegion, TerrainType } from "../types.js";
import { TERRAIN_FILL, TERRAIN_BORDER } from "../utils/ColorUtils.js";

export class MapRenderer {
  readonly container = new Container();
  private lastTick = -1;

  update(state: GameState) {
    if (state.tick === this.lastTick) return;
    this.lastTick = state.tick;
    this.rebuild(state);
  }

  private rebuild(state: GameState) {
    this.container.removeChildren();

    // Background
    const bg = new Graphics();
    bg.fill({ color: 0x0a0a0f });
    bg.rect(0, 0, 1000, 1000);
    bg.fill();
    this.container.addChild(bg);

    // Draw regions depth-first: parents first, then children on top
    const roots = Object.values(state.map.regions).filter(
      (r) => !r.parentId
    );
    for (const root of roots) {
      this.drawRegionTree(state, root);
    }
  }

  private drawRegionTree(state: GameState, region: MapRegion) {
    this.drawRegion(region);
    for (const childId of region.children) {
      const child = state.map.regions[childId];
      if (child) this.drawRegionTree(state, child);
    }
  }

  private drawRegion(region: MapRegion) {
    const { x, y, width, height } = region.bounds;
    if (width < 2 || height < 2) return;

    const terrain = (region.terrain ?? "source") as TerrainType;
    const fill = TERRAIN_FILL[terrain] ?? TERRAIN_FILL.source;
    const border = TERRAIN_BORDER[terrain] ?? TERRAIN_BORDER.source;
    const isLeaf = region.children.length === 0;

    const g = new Graphics();

    // Fill — leaf nodes get full fill, parents get a slightly darker tint
    g.fill({ color: fill });
    g.rect(x + 1, y + 1, width - 2, height - 2);
    g.fill();

    // For parent regions, draw a darker overlay so children stand out
    if (!isLeaf) {
      const overlay = new Graphics();
      overlay.fill({ color: 0x000000 });
      overlay.rect(x + 1, y + 1, width - 2, height - 2);
      overlay.fill();
      overlay.alpha = 0.3;
      this.container.addChild(overlay);
    }

    // Border
    g.stroke({ color: border, width: isLeaf ? 1 : 2 });
    g.rect(x, y, width, height);
    g.stroke();

    this.container.addChild(g);
    // Text labels are rendered by MapOverlay (HTML) for crisp rendering at all zoom levels
  }
}
