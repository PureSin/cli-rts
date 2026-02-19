import type { UnitType, UnitStatus, TerrainType, ActionType, PlayerColor } from "../types.js";

export interface SpriteRef {
  // Geometric fallback (default pack)
  shape?: "circle" | "diamond" | "square" | "triangle" | "pentagon" | "hexagon";
  size?: number;

  // Image sprite (peon pack)
  sprite?: string;
  scale?: number;
}

export interface TerrainStyle {
  fill: number;
  border: number;
}

export interface ActionStyle {
  color: number;
  label: string;
}

export interface ManifestAssets {
  units: Record<UnitType, SpriteRef>;
  // terrain: Record<TerrainType, TerrainStyle>; // Not used yet in new packs but kept for compat if needed
  // actions: Record<ActionType, ActionStyle>;
  statusIndicators: Record<string, { color: number }>;
  sounds?: Record<string, string>;
  ui?: Record<string, string>;
}

export interface AssetManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  base?: string;
  assets: ManifestAssets;
}
