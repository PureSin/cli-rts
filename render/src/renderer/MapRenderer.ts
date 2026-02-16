import { Container, Graphics, Text } from "pixi.js";
import type { GameState, MapRegion, TerrainType } from "../types.js";
import { TERRAIN_FILL, TERRAIN_BORDER } from "../utils/ColorUtils.js";
import { sanitizeRegionLabel } from "../utils/RegionSanitizer.js";

export class MapRenderer {
  readonly container = new Container();
  private regionCount = -1;

  update(state: GameState) {
    const regions = Object.values(state.map.regions);
    if (regions.length === this.regionCount) return;
    this.regionCount = regions.length;
    this.rebuild(regions);
  }

  private rebuild(regions: MapRegion[]) {
    this.container.removeChildren();

    // Background grid
    const bg = new Graphics();
    bg.fill({ color: 0x0a0a0f });
    bg.rect(0, 0, 1000, 1000);
    bg.fill();
    this.container.addChild(bg);

    for (const region of regions) {
      this.drawRegion(region);
    }
  }

  private drawRegion(region: MapRegion) {
    const { x, y, width, height } = region.bounds;
    const terrain = (region.terrain ?? "source") as TerrainType;
    const fill = TERRAIN_FILL[terrain] ?? TERRAIN_FILL.source;
    const border = TERRAIN_BORDER[terrain] ?? TERRAIN_BORDER.source;

    const g = new Graphics();

    // Fill
    g.fill({ color: fill });
    g.rect(x + 1, y + 1, width - 2, height - 2);
    g.fill();

    // Border
    g.stroke({ color: border, width: 1 });
    g.rect(x, y, width, height);
    g.stroke();

    this.container.addChild(g);

    // Label
    const label = sanitizeRegionLabel(region.id);
    const text = new Text({
      text: label,
      style: {
        fontSize: 10,
        fill: border,
        fontFamily: "Courier New",
      },
    });
    text.x = x + 4;
    text.y = y + 4;
    text.alpha = 0.7;
    this.container.addChild(text);
  }
}
