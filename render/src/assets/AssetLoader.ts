import { Container, Graphics, Sprite, Assets } from "pixi.js";
import type { UnitType, UnitStatus, PlayerColor } from "../types.js";
import { PLAYER_COLOR_HEX } from "../utils/ColorUtils.js";
import type { SpriteRef, AssetManifest } from "./AssetManifest.js";
import placeholderManifest from "./packs/placeholder/manifest.json";

// Default to placeholder until loadPack is called
let currentManifest: AssetManifest = {
  name: "placeholder",
  version: "0.0.0",
  assets: {
    units: placeholderManifest.units as unknown as Record<UnitType, SpriteRef>,
    statusIndicators: placeholderManifest.statusIndicators as unknown as Record<string, { color: number | string }>
  }
} as unknown as AssetManifest;

let currentPackName = "placeholder";

// Helper to resolve paths relative to pack
function resolveAssetPath(path: string): string {
  if (path.startsWith("http")) return path;
  return `/packs/${currentPackName}/${path}`;
}

export async function loadPack(packName: string) {
  try {
    console.log(`[AssetLoader] Loading pack: ${packName}`);
    const res = await fetch(`/packs/${packName}/manifest.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const manifest = await res.json() as AssetManifest;

    // Preload sprites
    const spritesToLoad: string[] = [];
    if (manifest.assets.units) {
      Object.values(manifest.assets.units).forEach(def => {
        if (def.sprite) {
          const fullPath = `/packs/${packName}/${def.sprite}`;
          spritesToLoad.push(fullPath);
          // Assets.load expects the key/url. We'll use the full path as key.
        }
      });
    }

    if (spritesToLoad.length > 0) {
      console.log(`[AssetLoader] Preloading ${spritesToLoad.length} sprites...`);
      await Assets.load(spritesToLoad);
    }

    currentManifest = manifest;
    currentPackName = packName;
    console.log(`[AssetLoader] Pack '${packName}' loaded successfully.`);

  } catch (e) {
    console.error(`[AssetLoader] Failed to load pack '${packName}':`, e);
    console.warn("[AssetLoader] Falling back to placeholder/current assets.");
  }
}

const statusColors: Record<string, number> = {
  waiting: 0xffcc00,
  failed: 0xff2222,
};

const actionTypeColors: Record<string, number> = {
  scouting: 0x4488ff,
  building: 0xff8844,
  attacking: 0xff4444,
  summoning: 0xaa44ff,
  researching: 0x44ccaa,
  special: 0x44ff44,
};

function drawShape(g: Graphics, shape: string | undefined, size: number, color: number) {
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
    default:
      // Fallback circle
      g.circle(0, 0, size);
  }
  g.fill();
}

export function createUnitGraphics(unitType: UnitType, playerColor: PlayerColor): Container {
  const defaults = currentManifest.assets.units?.soldier || { shape: "circle", size: 10 };
  const def = currentManifest.assets.units?.[unitType] ?? defaults;
  const color = PLAYER_COLOR_HEX[playerColor] ?? 0xffffff;

  const container = new Container();

  // Player color ring
  const ring = new Graphics();
  const ringSize = (def.size ?? 12) + 4;
  ring.fill({ color, alpha: 0.3 });
  ring.circle(0, 0, ringSize);
  ring.fill();
  container.addChild(ring);

  if (def.sprite) {
    // Sprite mode
    const fullPath = resolveAssetPath(def.sprite);
    // Assets.get(fullPath) because we preloaded it
    // If not found, it might return Promise? But Assets.load cache should handle it.
    // Ideally we use Assets.get(fullPath) which returns a Texture if loaded.
    // If not loaded yet (should be), we might need to handle async?
    // But createUnitGraphics is synchronous.
    // Pixi's `Sprite.from` handles URL loading internally but might be async for texture ready.
    // Since we preloaded, `Sprite.from` should have texture ready or almost ready.
    const sprite = Sprite.from(fullPath);
    sprite.anchor.set(0.5);
    const scale = def.scale ?? 1.0;
    sprite.scale.set(scale);
    container.addChild(sprite);
  } else {
    // Shape mode
    const g = new Graphics();
    drawShape(g, def.shape, def.size ?? 10, color);
    container.addChild(g);
  }

  return container;
}

export function createStatusIndicator(status: UnitStatus, actionType?: string): Graphics | null {
  // Check manifest for overrides?
  // Current manifest schema has simple color overrides
  const manifestColor = currentManifest.assets.statusIndicators?.[status]?.color;

  let color = typeof manifestColor === 'string' ? parseInt(manifestColor, 16) : (manifestColor as number);

  if (isNaN(color) || color == null) {
    color = status === "acting"
      ? (actionTypeColors[actionType ?? ""] ?? actionTypeColors.special)
      : statusColors[status];
  }

  if (color == null) return null;

  const g = new Graphics();
  g.fill({ color });
  g.circle(0, 0, 3);
  g.fill();
  g.y = -20;
  return g;
}

export function playSound(soundKey: string) {
  const soundPath = currentManifest.assets.sounds?.[soundKey];
  if (!soundPath) return;

  const fullPath = resolveAssetPath(soundPath);
  const audio = new Audio(fullPath);
  audio.volume = 0.5;
  audio.play().catch(e => console.warn("Audio play failed", e));
}
