// Mirrored from capture/src/game-state.ts — HTTP/JSON is the contract boundary

export type UnitType =
  | "commander"
  | "scout"
  | "warrior"
  | "strategist"
  | "soldier"
  | "specialist";

export type UnitStatus =
  | "spawning"
  | "idle"
  | "moving"
  | "acting"
  | "waiting"
  | "failed"
  | "despawning";

export type ActionType =
  | "scouting"
  | "building"
  | "attacking"
  | "summoning"
  | "researching"
  | "special";

export type TerrainType =
  | "base"
  | "source"
  | "test"
  | "config"
  | "docs"
  | "build"
  | "assets"
  | "external";

export type GameEventType =
  | "player_joined"
  | "player_left"
  | "unit_spawned"
  | "unit_despawned"
  | "unit_action_start"
  | "unit_action_complete"
  | "unit_action_failed"
  | "unit_waiting"
  | "objective_completed"
  | "player_idle"
  | "player_compact";

export type PlayerColor = "blue" | "red" | "green" | "yellow" | "purple" | "orange";

export interface MapPosition {
  region: string;
  x: number;
  y: number;
}

export interface MapRegion {
  id: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  terrain: TerrainType;
  fileCount: number;
  children: string[];
}

export interface GameMap {
  width: number;
  height: number;
  regions: Record<string, MapRegion>;
}

export interface UnitAction {
  toolUseId: string;
  toolName: string;
  actionType: ActionType;
  target: string;
  startedAt: number;
  description: string;
}

export interface Unit {
  id: string;
  type: UnitType;
  displayName: string;
  status: UnitStatus;
  position: MapPosition;
  targetPosition: MapPosition | null;
  currentAction: UnitAction | null;
  spawnedAt: number;
  lastActionAt: number;
}

export interface Player {
  sessionId: string;
  status: "active" | "idle" | "disconnected";
  model: string;
  permissionMode: string;
  color: PlayerColor;
  joinedAt: number;
  lastActivityAt: number;
  commander: Unit;
  units: Record<string, Unit>;
  stats: {
    toolCallsTotal: number;
    toolCallsFailed: number;
    filesRead: number;
    filesWritten: number;
    bashCommandsRun: number;
    subagentsSpawned: number;
  };
}

export interface Objective {
  taskId: string;
  subject: string;
  description?: string;
  status: "active" | "completed";
  completedAt?: number;
  position?: MapPosition;
}

export interface GameEvent {
  id: string;
  tick: number;
  timestamp: number;
  playerId: string;
  unitId: string;
  type: GameEventType;
  data: Record<string, unknown>;
  message: string;
}

export interface GameState {
  tick: number;
  timestamp: number;
  repo: { path: string; name: string };
  map: GameMap;
  players: Record<string, Player>;
  objectives: Record<string, Objective>;
  eventLog: GameEvent[];
}
