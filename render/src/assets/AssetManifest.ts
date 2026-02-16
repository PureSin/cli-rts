import type { UnitType, UnitStatus, TerrainType, ActionType, PlayerColor } from "../types.js";

export interface SpriteRef {
  shape: "circle" | "diamond" | "square" | "triangle" | "pentagon" | "hexagon";
  size: number;
}

export interface TerrainStyle {
  fill: number;
  border: number;
}

export interface ActionStyle {
  color: number;
  label: string;
}

export interface AssetManifest {
  name: string;
  version: string;
  units: Record<UnitType, SpriteRef>;
  terrain: Record<TerrainType, TerrainStyle>;
  actions: Record<ActionType, ActionStyle>;
  playerColors: Record<PlayerColor, number>;
  statusIndicators: Record<Extract<UnitStatus, "acting" | "waiting" | "failed">, { color: number }>;
}
