import { realpathSync } from "node:fs";

// ── Types ──

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
  | "player_compact"
  | "session_clear";

export type PlayerColor = "blue" | "red" | "green" | "yellow" | "purple" | "orange";

const PLAYER_COLORS: PlayerColor[] = ["blue", "red", "green", "yellow", "purple", "orange"];

export interface MapPosition {
  region: string;
  x: number;
  y: number;
}

export interface MapRegion {
  id: string;
  label: string;
  parentId?: string;
  bounds: { x: number; y: number; width: number; height: number };
  terrain: TerrainType;
  fileCount: number;
  files: string[];
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
  clearedAt?: number;
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

// ── Factories ──

export function createEmptyState(repoPath: string): GameState {
  const name = repoPath.split("/").filter(Boolean).pop() ?? "unknown";
  return {
    tick: 0,
    timestamp: Date.now(),
    repo: { path: repoPath, name },
    map: { width: 1000, height: 1000, regions: {} },
    players: {},
    objectives: {},
    eventLog: [],
  };
}

export function createUnit(id: string, type: UnitType, displayName: string): Unit {
  return {
    id,
    type,
    displayName,
    status: "idle",
    position: { region: "base", x: 500, y: 500 },
    targetPosition: null,
    currentAction: null,
    spawnedAt: Date.now(),
    lastActionAt: Date.now(),
  };
}

export function assignPlayerColor(state: GameState): PlayerColor {
  const used = new Set(Object.values(state.players).map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? "blue";
}

// Map agent_type to UnitType
export function agentTypeToUnitType(agentType: string): UnitType {
  switch (agentType) {
    case "Explore": return "scout";
    case "Bash": return "warrior";
    case "Plan": return "strategist";
    case "general-purpose": return "soldier";
    default: return "specialist";
  }
}

// Map tool_name to ActionType
export function toolToActionType(toolName: string): ActionType {
  if (["Read", "Glob", "Grep"].includes(toolName)) return "scouting";
  if (["Write", "Edit"].includes(toolName)) return "building";
  if (toolName === "Bash") return "attacking";
  if (toolName === "Task") return "summoning";
  if (["WebFetch", "WebSearch"].includes(toolName)) return "researching";
  return "special";
}

// Extract a file path / target from tool_input
export function extractTarget(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
    case "Edit":
    case "Write":
      return (toolInput.file_path as string) ?? "";
    case "Glob":
      return (toolInput.pattern as string) ?? (toolInput.path as string) ?? "";
    case "Grep":
      return (toolInput.path as string) ?? (toolInput.pattern as string) ?? "";
    case "Bash":
      return (toolInput.command as string) ?? "";
    case "WebFetch":
      return (toolInput.url as string) ?? "";
    case "WebSearch":
      return (toolInput.query as string) ?? "";
    default:
      return JSON.stringify(toolInput).slice(0, 100);
  }
}

// Derive map region from a file path
export function pathToRegion(filePath: string, repoPath: string): string {
  // Resolve symlinks (e.g. macOS /tmp → /private/tmp) for reliable prefix stripping
  let resolvedFile = filePath;
  let resolvedRepo = repoPath;
  try { resolvedFile = realpathSync(filePath); } catch { /* file may not exist yet */ }
  try { resolvedRepo = realpathSync(repoPath); } catch { /* use as-is */ }

  const relative = resolvedFile.startsWith(resolvedRepo)
    ? resolvedFile.slice(resolvedRepo.length).replace(/^\//, "")
    : resolvedFile.replace(/^\//, "");

  const parts = relative.split("/");
  // Use the file's full parent directory as its region so that file accesses
  // progressively reveal deeper map structure (e.g. "capture/src/commands").
  // Files in the repo root fall back to "base".
  if (parts.length <= 1) return "base";
  return parts.slice(0, parts.length - 1).join("/");
}
