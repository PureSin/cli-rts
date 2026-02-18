import {
  GameState,
  GameEvent,
  GameEventType,
  TerrainType,
  Player,
  Unit,
  createUnit,
  assignPlayerColor,
  agentTypeToUnitType,
  toolToActionType,
  extractTarget,
  pathToRegion,
} from "./game-state.js";

let eventCounter = 0;

function addEvent(
  state: GameState,
  type: GameEventType,
  playerId: string,
  unitId: string,
  message: string,
  data: Record<string, unknown> = {}
): GameEvent {
  const event: GameEvent = {
    id: `evt-${++eventCounter}`,
    tick: state.tick,
    timestamp: state.timestamp,
    playerId,
    unitId,
    type,
    data,
    message,
  };
  state.eventLog.push(event);
  // Keep last 200 events
  if (state.eventLog.length > 200) {
    state.eventLog = state.eventLog.slice(-200);
  }
  return event;
}

function bumpTick(state: GameState): void {
  state.tick++;
  state.timestamp = Date.now();
}

function findUnitForSession(state: GameState, sessionId: string): { player: Player; unit: Unit } | null {
  const player = state.players[sessionId];
  if (!player) return null;
  return { player, unit: player.commander };
}

function findUnitByAgentId(state: GameState, sessionId: string, agentId: string): { player: Player; unit: Unit } | null {
  const player = state.players[sessionId];
  if (!player) return null;
  const unit = player.units[agentId];
  if (!unit) return { player, unit: player.commander };
  return { player, unit };
}

const MAP_PADDING = 8;
const LABEL_HEIGHT = 16;

function ensureRegion(state: GameState, region: string): void {
  if (state.map.regions[region]) return;

  // Ensure "base" root always exists
  if (!state.map.regions["base"]) {
    state.map.regions["base"] = {
      id: "base",
      label: "root",
      bounds: { x: 0, y: 0, width: state.map.width, height: state.map.height },
      terrain: "base",
      fileCount: 0,
      files: [],
      children: [],
    };
  }

  // "external" is a special top-level region (no parent hierarchy)
  if (region === "external") {
    addChildRegion(state, "base", {
      id: "external",
      label: "external",
      terrain: "external",
    });
    return;
  }

  if (region === "base") return;

  // Build ancestor chain: "src/auth/utils" → ["src", "src/auth", "src/auth/utils"]
  const parts = region.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const ancestor = parts.slice(0, i).join("/");
    if (state.map.regions[ancestor]) continue;

    const parentId = i === 1 ? "base" : parts.slice(0, i - 1).join("/");
    ensureRegion(state, parentId); // ensure parent exists first

    addChildRegion(state, parentId, {
      id: ancestor,
      label: parts[i - 1],
      terrain: inferTerrain(ancestor),
    });
  }
}

function addChildRegion(
  state: GameState,
  parentId: string,
  opts: { id: string; label: string; terrain: TerrainType }
): void {
  const parent = state.map.regions[parentId];
  if (!parent) return;

  // Subdivide parent's content area among children
  const pad = MAP_PADDING;
  const contentX = parent.bounds.x + pad;
  const contentY = parent.bounds.y + pad + LABEL_HEIGHT;
  const contentW = parent.bounds.width - pad * 2;
  const contentH = parent.bounds.height - pad - LABEL_HEIGHT - pad;

  const siblingCount = parent.children.length + 1;
  // Use a simple grid subdivision: try roughly square cells
  const cols = Math.ceil(Math.sqrt(siblingCount));
  const rows = Math.ceil(siblingCount / cols);
  const cellW = contentW / cols;
  const cellH = contentH / rows;

  // Re-layout all existing siblings plus the new one
  parent.children.push(opts.id);

  for (let idx = 0; idx < parent.children.length; idx++) {
    const childId = parent.children[idx];
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const bounds = {
      x: Math.round(contentX + col * cellW),
      y: Math.round(contentY + row * cellH),
      width: Math.round(cellW),
      height: Math.round(cellH),
    };

    if (childId === opts.id) {
      // Create the new region
      state.map.regions[opts.id] = {
        id: opts.id,
        label: opts.label,
        parentId,
        bounds,
        terrain: opts.terrain,
        fileCount: 0,
        files: [],
        children: [],
      };
    } else {
      // Re-layout existing sibling
      const existing = state.map.regions[childId];
      if (existing) {
        existing.bounds = bounds;
        // Recursively re-layout children of this sibling
        relayoutChildren(state, childId);
      }
    }
  }
}

function relayoutChildren(state: GameState, regionId: string): void {
  const region = state.map.regions[regionId];
  if (!region || region.children.length === 0) return;

  const pad = MAP_PADDING;
  const contentX = region.bounds.x + pad;
  const contentY = region.bounds.y + pad + LABEL_HEIGHT;
  const contentW = region.bounds.width - pad * 2;
  const contentH = region.bounds.height - pad - LABEL_HEIGHT - pad;

  const count = region.children.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = contentW / cols;
  const cellH = contentH / rows;

  for (let idx = 0; idx < count; idx++) {
    const childId = region.children[idx];
    const child = state.map.regions[childId];
    if (!child) continue;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    child.bounds = {
      x: Math.round(contentX + col * cellW),
      y: Math.round(contentY + row * cellH),
      width: Math.round(cellW),
      height: Math.round(cellH),
    };
    relayoutChildren(state, childId);
  }
}

function inferTerrain(region: string): TerrainType {
  if (!region || region === "base") return "base";
  const lower = region.toLowerCase();
  if (lower.startsWith("src") || lower.startsWith("lib")) return "source";
  if (lower.includes("test") || lower.includes("__test")) return "test";
  if (lower.startsWith("doc") || lower.endsWith(".md")) return "docs";
  if (lower.startsWith("dist") || lower.startsWith("build")) return "build";
  if (lower.includes("asset") || lower.includes("image") || lower.includes("font")) return "assets";
  if (lower.includes("config") || lower.startsWith(".")) return "config";
  return "source";
}

// ── Event Handlers ──

export function handleSessionStart(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const model = (payload.model as string) ?? "unknown";
  const permissionMode = (payload.permission_mode as string) ?? "default";
  const cwd = (payload.cwd as string) ?? state.repo.path;

  // Always prefer the cwd from the session-start payload — it's the authoritative
  // working directory where Claude Code is actually running, regardless of where
  // the daemon binary was launched from.
  if (cwd) {
    state.repo.path = cwd;
    state.repo.name = cwd.split("/").filter(Boolean).pop() ?? "unknown";
  }

  const commander = createUnit(sessionId, "commander", "Commander");
  const player: Player = {
    sessionId,
    status: "active",
    model,
    permissionMode,
    color: assignPlayerColor(state),
    joinedAt: Date.now(),
    lastActivityAt: Date.now(),
    commander,
    units: {},
    stats: {
      toolCallsTotal: 0,
      toolCallsFailed: 0,
      filesRead: 0,
      filesWritten: 0,
      bashCommandsRun: 0,
      subagentsSpawned: 0,
    },
  };

  state.players[sessionId] = player;
  return addEvent(state, "player_joined", sessionId, sessionId, `Player joined (${model})`);
}

export function handleSessionEnd(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const player = state.players[sessionId];
  if (player) {
    player.status = "disconnected";
    player.commander.status = "despawning";
    for (const unit of Object.values(player.units)) {
      unit.status = "despawning";
    }
  }
  return addEvent(state, "player_left", sessionId, sessionId, "Player disconnected", {
    reason: payload.reason,
  });
}

export function handleUserPromptSubmit(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const player = state.players[sessionId];
  if (player) {
    player.status = "active";
    player.commander.status = "acting";
    player.lastActivityAt = Date.now();
  }
  const prompt = (payload.prompt as string) ?? "";
  const preview = prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt;
  return addEvent(state, "unit_action_start", sessionId, sessionId, `Commander received orders: "${preview}"`, {
    prompt,
  });
}

export function handleStop(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const player = state.players[sessionId];
  if (player) {
    player.status = "idle";
    player.commander.status = "idle";
    player.commander.currentAction = null;
    for (const unit of Object.values(player.units)) {
      unit.status = "idle";
      unit.currentAction = null;
    }
  }
  return addEvent(state, "player_idle", sessionId, sessionId, "Turn complete — all units idle");
}

export function handlePreToolUse(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const toolName = (payload.tool_name as string) ?? "unknown";
  const toolInput = (payload.tool_input as Record<string, unknown>) ?? {};
  const toolUseId = (payload.tool_use_id as string) ?? `tool-${Date.now()}`;
  const agentId = payload.agent_id as string | undefined;

  const result = agentId
    ? findUnitByAgentId(state, sessionId, agentId)
    : findUnitForSession(state, sessionId);
  const unitId = agentId ?? sessionId;

  const FILE_TOOLS = new Set(["Read", "Edit", "Write", "Glob", "Grep"]);
  const WEB_TOOLS = new Set(["WebFetch", "WebSearch"]);

  if (result) {
    const { player, unit } = result;
    const target = extractTarget(toolName, toolInput);
    const actionType = toolToActionType(toolName);

    // Only file-based tools create directory regions
    // Bash, Task, and other non-file tools keep the unit at its current position
    let region: string;
    if (FILE_TOOLS.has(toolName) && target && !target.startsWith("http")) {
      region = pathToRegion(target, state.repo.path);
    } else if (WEB_TOOLS.has(toolName)) {
      region = "external";
    } else {
      region = unit.position.region;
    }

    ensureRegion(state, region);
    const regionData = state.map.regions[region];

    // Track file in region
    let filename: string | undefined;
    if (FILE_TOOLS.has(toolName) && target && !target.startsWith("http")) {
      filename = target.split("/").pop();
      if (filename && regionData && !regionData.files.includes(filename)) {
        if (regionData.files.length < 20) {
          regionData.files.push(filename);
        }
        regionData.fileCount = regionData.files.length;
      }
    }

    // Position unit at its file within the region
    let targetX = regionData ? regionData.bounds.x + regionData.bounds.width / 2 : unit.position.x;
    let targetY = regionData ? regionData.bounds.y + regionData.bounds.height / 2 : unit.position.y;
    if (filename && regionData && regionData.files.length > 0) {
      const fileIndex = regionData.files.indexOf(filename);
      if (fileIndex >= 0) {
        const padTop = 24; // space for region label
        const padBottom = 8;
        const usableHeight = regionData.bounds.height - padTop - padBottom;
        const slotHeight = usableHeight / Math.max(regionData.files.length, 1);
        targetX = regionData.bounds.x + regionData.bounds.width / 2;
        targetY = regionData.bounds.y + padTop + slotHeight * fileIndex + slotHeight / 2;
      }
    }

    unit.status = "acting";
    unit.currentAction = {
      toolUseId,
      toolName,
      actionType,
      target,
      startedAt: Date.now(),
      description: `${toolName}: ${target.length > 60 ? target.slice(0, 60) + "…" : target}`,
    };
    unit.targetPosition = {
      region,
      x: targetX,
      y: targetY,
    };
    unit.lastActionAt = Date.now();
    player.lastActivityAt = Date.now();
    player.stats.toolCallsTotal++;

    if (toolName === "Read" || toolName === "Glob" || toolName === "Grep") player.stats.filesRead++;
    if (toolName === "Write" || toolName === "Edit") player.stats.filesWritten++;
    if (toolName === "Bash") player.stats.bashCommandsRun++;
  }

  return addEvent(state, "unit_action_start", sessionId, unitId, `${toolName} → ${extractTarget(toolName, (payload.tool_input as Record<string, unknown>) ?? {})}`, {
    toolName,
    toolUseId,
  });
}

export function handlePostToolUse(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const toolUseId = (payload.tool_use_id as string) ?? "";
  const agentId = payload.agent_id as string | undefined;

  const result = agentId
    ? findUnitByAgentId(state, sessionId, agentId)
    : findUnitForSession(state, sessionId);
  const unitId = agentId ?? sessionId;

  if (result) {
    const { unit } = result;
    if (unit.targetPosition) {
      unit.position = unit.targetPosition;
      unit.targetPosition = null;
    }
    unit.status = "idle";
    unit.currentAction = null;
  }

  return addEvent(state, "unit_action_complete", sessionId, unitId, `Action complete (${(payload.tool_name as string) ?? "tool"})`, {
    toolUseId,
  });
}

export function handlePostToolUseFailure(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const agentId = payload.agent_id as string | undefined;

  const result = agentId
    ? findUnitByAgentId(state, sessionId, agentId)
    : findUnitForSession(state, sessionId);
  const unitId = agentId ?? sessionId;

  if (result) {
    const { player, unit } = result;
    unit.status = "failed";
    unit.currentAction = null;
    player.stats.toolCallsFailed++;
  }

  const error = (payload.error as string) ?? "unknown error";
  return addEvent(state, "unit_action_failed", sessionId, unitId, `Action failed: ${error.slice(0, 80)}`, {
    error,
    toolName: payload.tool_name,
  });
}

export function handleSubagentStart(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const agentId = (payload.agent_id as string) ?? `agent-${Date.now()}`;
  const agentType = (payload.agent_type as string) ?? "general-purpose";

  const player = state.players[sessionId];
  if (player) {
    const unitType = agentTypeToUnitType(agentType);
    const count = Object.keys(player.units).length + 1;
    const displayName = `${unitType.charAt(0).toUpperCase() + unitType.slice(1)}-${count}`;
    const unit = createUnit(agentId, unitType, displayName);
    unit.status = "spawning";
    unit.position = { ...player.commander.position };
    player.units[agentId] = unit;
    player.stats.subagentsSpawned++;
    player.lastActivityAt = Date.now();
  }

  return addEvent(state, "unit_spawned", sessionId, agentId, `Subagent spawned: ${agentType}`, {
    agentType,
    agentId,
  });
}

export function handleSubagentStop(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const agentId = (payload.agent_id as string) ?? "";

  const player = state.players[sessionId];
  if (player && player.units[agentId]) {
    player.units[agentId].status = "despawning";
    player.units[agentId].currentAction = null;
    // Schedule removal so consumers can see the despawning state
    setTimeout(() => {
      if (player.units[agentId]?.status === "despawning") {
        delete player.units[agentId];
      }
    }, 2000);
  }

  return addEvent(state, "unit_despawned", sessionId, agentId, `Subagent despawned: ${(payload.agent_type as string) ?? "unknown"}`, {
    agentId,
  });
}

export function handlePermissionRequest(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;

  const result = findUnitForSession(state, sessionId);
  if (result) {
    result.unit.status = "waiting";
  }

  return addEvent(state, "unit_waiting", sessionId, sessionId, `Awaiting permission: ${(payload.tool_name as string) ?? "tool"}`, {
    toolName: payload.tool_name,
  });
}

export function handleNotification(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const message = (payload.message as string) ?? "";
  const notificationType = (payload.notification_type as string) ?? "";

  if (notificationType === "idle_prompt") {
    const player = state.players[sessionId];
    if (player) player.status = "idle";
  }

  return addEvent(state, "player_idle", sessionId, sessionId, `Notification: ${message}`, {
    notificationType,
  });
}

export function handleTaskCompleted(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;
  const taskId = (payload.task_id as string) ?? `task-${Date.now()}`;
  const subject = (payload.task_subject as string) ?? "Unknown task";

  state.objectives[taskId] = {
    taskId,
    subject,
    status: "completed",
    completedAt: Date.now(),
  };

  return addEvent(state, "objective_completed", sessionId, sessionId, `Objective complete: ${subject}`, {
    taskId,
    subject,
  });
}

export function handlePreCompact(state: GameState, payload: Record<string, unknown>): GameEvent {
  bumpTick(state);
  const sessionId = payload.session_id as string;

  return addEvent(state, "player_compact", sessionId, sessionId, `Context compacting (${(payload.trigger as string) ?? "auto"})`, {
    trigger: payload.trigger,
  });
}

// ── Dispatcher ──

export function handleEvent(state: GameState, eventType: string, payload: Record<string, unknown>): GameEvent {
  switch (eventType) {
    case "session-start": return handleSessionStart(state, payload);
    case "session-end": return handleSessionEnd(state, payload);
    case "user-prompt": return handleUserPromptSubmit(state, payload);
    case "stop": return handleStop(state, payload);
    case "pre-tool": return handlePreToolUse(state, payload);
    case "post-tool": return handlePostToolUse(state, payload);
    case "post-tool-failure": return handlePostToolUseFailure(state, payload);
    case "subagent-start": return handleSubagentStart(state, payload);
    case "subagent-stop": return handleSubagentStop(state, payload);
    case "permission-request": return handlePermissionRequest(state, payload);
    case "notification": return handleNotification(state, payload);
    case "task-completed": return handleTaskCompleted(state, payload);
    case "pre-compact": return handlePreCompact(state, payload);
    default:
      bumpTick(state);
      return addEvent(state, "player_idle", "", "", `Unknown event: ${eventType}`);
  }
}
