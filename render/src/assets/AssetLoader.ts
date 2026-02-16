import { Graphics } from "pixi.js";
import type { UnitType, UnitStatus, PlayerColor } from "../types.js";
import { PLAYER_COLOR_HEX } from "../utils/ColorUtils.js";
import type { SpriteRef } from "./AssetManifest.js";
import manifest from "./packs/placeholder/manifest.json";

const unitDefs = manifest.units as Record<UnitType, SpriteRef>;
const statusColors: Record<string, number> = {
  acting: 0x44ff44,
  waiting: 0xffcc00,
  failed: 0xff2222,
};

function drawShape(g: Graphics, shape: SpriteRef["shape"], size: number, color: number) {
  g.fill({ color });
  switch (shape) {
    case "circle":
      g.circle(0, 0, size);
      break;
    case "diamond":
      g.poly([0, -size, size, 0, 0, size, -size, 0]);
      break;
    case "square":
      g.rect(-size, -size, size * 2, size * 2);
      break;
    case "triangle":
      g.poly([0, -size, size, size, -size, size]);
      break;
    case "pentagon": {
      const pts: number[] = [];
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        pts.push(Math.cos(angle) * size, Math.sin(angle) * size);
      }
      g.poly(pts);
      break;
    }
    case "hexagon": {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        pts.push(Math.cos(angle) * size, Math.sin(angle) * size);
      }
      g.poly(pts);
      break;
    }
  }
  g.fill();
}

export function createUnitGraphics(unitType: UnitType, playerColor: PlayerColor): Graphics {
  const def = unitDefs[unitType] ?? unitDefs.soldier;
  const color = PLAYER_COLOR_HEX[playerColor] ?? 0xffffff;

  const g = new Graphics();

  // Player color ring (slightly larger)
  g.fill({ color, alpha: 0.3 });
  g.circle(0, 0, def.size + 4);
  g.fill();

  // Unit shape
  drawShape(g, def.shape, def.size, color);

  return g;
}

export function createStatusIndicator(status: UnitStatus): Graphics | null {
  const color = statusColors[status];
  if (color == null) return null;

  const g = new Graphics();
  g.fill({ color });
  g.circle(0, 0, 3);
  g.fill();
  g.y = -20;
  return g;
}
