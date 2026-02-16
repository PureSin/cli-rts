import type { PlayerColor, TerrainType } from "../types.js";

export const PLAYER_COLOR_HEX: Record<PlayerColor, number> = {
  blue: 0x4488ff,
  red: 0xff4444,
  green: 0x44cc44,
  yellow: 0xcccc44,
  purple: 0xaa44ff,
  orange: 0xff8844,
};

export const TERRAIN_FILL: Record<TerrainType, number> = {
  base: 0x2a2a3c,
  source: 0x1a3a1a,
  test: 0x3a2a1a,
  config: 0x2a2a2a,
  docs: 0x3a3520,
  build: 0x2a2a30,
  assets: 0x2a1a30,
  external: 0x1a2530,
};

export const TERRAIN_BORDER: Record<TerrainType, number> = {
  base: 0x4a4a6c,
  source: 0x2d5a27,
  test: 0x6a4a2a,
  config: 0x4a4a4a,
  docs: 0x5a5530,
  build: 0x4a4a50,
  assets: 0x4a2a50,
  external: 0x2a4560,
};
