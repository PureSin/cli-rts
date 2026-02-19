# Game State Specification

How Claude Code hook events map to RTS game state changes, and the data format the daemon maintains.

## Hook → RTS State Mapping

### Session Lifecycle Hooks

#### SessionStart → Spawn Player

A new session means a new player enters the game.

**Hook payload (relevant fields):**
```json
{
  "session_id": "abc123",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "source": "startup|resume|clear|compact",
  "model": "claude-opus-4-6"
}
```

**RTS state change:**
- `source: "startup"` → create a new `Player`, spawn Commander at a starting position
- `source: "resume"` → returning player (treated same as startup if no existing state)
- `source: "clear"` → **rebirth**: existing player keeps their color; commander resets in-place (`clearedAt` timestamp set, triggers 300ms fade-out + 400ms fade-in animation), all subagents immediately despawned
- `model` → could influence player color or faction visual
- `permission_mode` → visual indicator (e.g., "bypassPermissions" = aggressive stance)

**What we get:** Player identity, working directory, model info, session type.

---

#### SessionEnd → Player Leaves (or Clears)

**Hook payload:**
```json
{
  "session_id": "abc123",
  "reason": "prompt_input_exit|clear|logout|other"
}
```

**RTS state change:**
- `reason: "clear"` → **session continues with the same player**. Emits `session_clear` event (renders as a `↺ cleared` divider in the event log in the player's color). Player stays active; a `SessionStart(source="clear")` immediately follows.
- All other reasons → mark player as disconnected, fade out all units, emit `player_left`.

**What we get:** Clean player lifecycle tracking, with `/clear` distinguished from a true disconnect.

---

#### UserPromptSubmit → Commander Receives Orders

**Hook payload:**
```json
{
  "session_id": "abc123",
  "prompt": "Fix the authentication bug in login.ts"
}
```

**RTS state change:**
- Commander unit plays "receiving orders" animation
- Could display prompt text as a floating command bubble
- Marks the start of an "action phase" for this player
- Prompt text could be parsed for file/directory references to anticipate unit movement

**What we get:** The actual user instruction — useful for UI tooltips and predicting where units will move.

---

#### Stop → Turn Complete

**Hook payload:**
```json
{
  "session_id": "abc123",
  "stop_hook_active": false
}
```

**RTS state change:**
- All units for this player transition to idle state
- Commander shows "mission complete" animation
- Units return to base or hold position

**What we get:** Clean signal that the agent finished its work cycle.

---

### Subagent Hooks → Unit Spawning/Despawning

#### SubagentStart → Spawn New Unit

**Hook payload:**
```json
{
  "session_id": "abc123",
  "agent_id": "agent-def456",
  "agent_type": "Explore"
}
```

**RTS state change:**
- Spawn a new unit near the Commander, type determined by `agent_type`:
  - `Explore` → **Scout** (fast, reveals map)
  - `Bash` → **Warrior** (executes commands, fights)
  - `Plan` → **Strategist** (plans, doesn't directly act)
  - `general-purpose` → **Soldier** (versatile unit)
  - Custom agent names → **Specialist** (unique appearance)
- Unit spawns from Commander's position with a "warp-in" animation
- Register `agent_id` → unit mapping for tracking

**What we get:** Subagent type and unique ID for the parent→child tree.

---

#### SubagentStop → Unit Despawns

**Hook payload:**
```json
{
  "session_id": "abc123",
  "agent_id": "def456",
  "agent_type": "Explore",
  "agent_transcript_path": "~/.claude/projects/.../abc123/subagents/agent-def456.jsonl"
}
```

**RTS state change:**
- Unit plays "warp-out" or death animation
- Remove unit from active roster
- `session_id` here is the **parent's** — confirms which player this unit belongs to

**What we get:** Clean unit lifecycle. Parent correlation via session_id.

---

### Tool Use Hooks → Unit Actions & Movement

These are the richest events for visualization. Every tool call tells us what a unit is doing and where.

#### PreToolUse → Unit Begins Action

**Hook payload:**
```json
{
  "session_id": "abc123",
  "tool_name": "Read",
  "tool_input": { "file_path": "/src/auth/login.ts" },
  "tool_use_id": "toolu_01ABC"
}
```

**RTS state change by tool type:**

| tool_name | Unit Action | Map Movement | Animation |
|-----------|------------|--------------|-----------|
| `Read` | Scouting | Move to file's map position | "Scanning" anim |
| `Glob` | Area scan | Highlight search region on map | "Radar sweep" anim |
| `Grep` | Deep scan | Highlight search region + results | "Scanning" with pulse |
| `Edit` | Building/modifying | Move to file position | "Constructing" anim |
| `Write` | Building/creating | Move to file position | "Building" anim |
| `Bash` | Combat/executing | Stay in place or move to CWD | "Attacking" anim |
| `Task` | Spawning unit | Commander position | "Training unit" anim |
| `WebFetch` | Remote recon | Move to map edge (external) | "Calling reinforcements" |
| `WebSearch` | Intelligence | Move to map edge (external) | "Scouting beyond map" |
| `mcp__*` | Special ability | Depends on MCP tool | Tool-specific anim |

**Extracting map position from tool_input:**

| tool_name | Position source | Example |
|-----------|----------------|---------|
| `Read` | `tool_input.file_path` | `/src/auth/login.ts` → auth region |
| `Edit` | `tool_input.file_path` | `/src/auth/login.ts` → auth region |
| `Write` | `tool_input.file_path` | `/src/utils/helper.ts` → utils region |
| `Glob` | `tool_input.path` or `tool_input.pattern` | `src/components/**` → components region |
| `Grep` | `tool_input.path` | `/src/` → src region |
| `Bash` | Parse `tool_input.command` for paths, else CWD | `npm test` → project root |
| `Task` | Commander position (subagent hasn't moved yet) | N/A |
| `WebFetch` | Map edge / "outside world" zone | N/A |
| `WebSearch` | Map edge / "outside world" zone | N/A |

**What we get:** Exact tool, full parameters, file paths for positioning, unique ID to correlate with PostToolUse.

---

#### PostToolUse → Action Completes Successfully

**Hook payload:**
```json
{
  "session_id": "abc123",
  "tool_name": "Edit",
  "tool_input": { "file_path": "/src/auth/login.ts", "old_string": "...", "new_string": "..." },
  "tool_response": { "filePath": "/src/auth/login.ts", "success": true },
  "tool_use_id": "toolu_01ABC"
}
```

**RTS state change:**
- Unit completes action animation
- Transition to idle or next action
- `tool_response.success` → success particle effect
- For Write/Edit: the file "building" on the map shows completion
- Correlate with PreToolUse via `tool_use_id` to measure action duration

**What we get:** Confirmation of success, response data, action duration (Pre→Post timing).

---

#### PostToolUseFailure → Action Failed

**Hook payload:**
```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "tool_use_id": "toolu_01ABC",
  "error": "Command exited with non-zero status code 1"
}
```

**RTS state change:**
- Unit plays "damaged" or "failed" animation
- Red flash or explosion particle
- Error text shown as floating combat text
- Unit health/status indicator turns red briefly

**What we get:** What failed, why, whether it was a user interrupt.

---

### Notification & Permission Hooks → Status Effects

#### PermissionRequest → Unit Awaiting Orders

**Hook payload:**
```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf node_modules" }
}
```

**RTS state change:**
- Unit stops and shows "awaiting approval" status bubble
- Flashing exclamation mark indicator
- The pending action is shown in the unit's tooltip
- Player's attention is needed — could pulse the player's color on the UI

**What we get:** What tool is waiting for permission, what it wants to do.

---

#### Notification → Alert Ping

**Hook payload:**
```json
{
  "session_id": "abc123",
  "message": "Claude needs your permission",
  "notification_type": "permission_prompt|idle_prompt"
}
```

**RTS state change:**
- `permission_prompt` → ping/alert animation on the unit needing permission
- `idle_prompt` → Commander enters deep idle state, ZZZ animation
- Minimap ping at unit location

**What we get:** Alert type and message for UI display.

---

### Team Hooks → Advanced Multi-Unit

#### TeammateIdle → Allied Unit Goes Idle

**Hook payload:**
```json
{
  "session_id": "abc123",
  "teammate_name": "researcher",
  "team_name": "my-project"
}
```

**RTS state change:**
- Named teammate unit transitions to idle
- Could be rendered as an allied player's unit

**What we get:** Team structure, teammate identity.

---

#### TaskCompleted → Objective Marker Cleared

**Hook payload:**
```json
{
  "session_id": "abc123",
  "task_id": "task-001",
  "task_subject": "Implement user authentication"
}
```

**RTS state change:**
- Objective marker on the map is cleared/completed
- Victory fanfare particle effect
- Task list UI updates

**What we get:** Task progress tracking for objectives overlay.

---

#### PreCompact → Memory Consolidation

**Hook payload:**
```json
{
  "session_id": "abc123",
  "trigger": "manual|auto"
}
```

**RTS state change:**
- Commander plays "regrouping" animation
- Visual indicator that the player is consolidating (fog briefly increases?)
- Mostly informational — signals context window pressure

**What we get:** Signal that the agent is running low on context.

---

## Hooks We Subscribe To

All hooks should be **async** (`"async": true`) to never block agents.

```json
{
  "hooks": {
    "SessionStart":       [{ "hooks": [{ "type": "command", "command": "cli-rts emit session-start", "async": true }] }],
    "SessionEnd":         [{ "hooks": [{ "type": "command", "command": "cli-rts emit session-end", "async": true }] }],
    "UserPromptSubmit":   [{ "hooks": [{ "type": "command", "command": "cli-rts emit user-prompt", "async": true }] }],
    "Stop":               [{ "hooks": [{ "type": "command", "command": "cli-rts emit stop", "async": true }] }],
    "PreToolUse":         [{ "hooks": [{ "type": "command", "command": "cli-rts emit pre-tool", "async": true }] }],
    "PostToolUse":        [{ "hooks": [{ "type": "command", "command": "cli-rts emit post-tool", "async": true }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "cli-rts emit post-tool-failure", "async": true }] }],
    "SubagentStart":      [{ "hooks": [{ "type": "command", "command": "cli-rts emit subagent-start", "async": true }] }],
    "SubagentStop":       [{ "hooks": [{ "type": "command", "command": "cli-rts emit subagent-stop", "async": true }] }],
    "PermissionRequest":  [{ "hooks": [{ "type": "command", "command": "cli-rts emit permission-request", "async": true }] }],
    "Notification":       [{ "hooks": [{ "type": "command", "command": "cli-rts emit notification", "async": true }] }],
    "TaskCompleted":      [{ "hooks": [{ "type": "command", "command": "cli-rts emit task-completed", "async": true }] }],
    "PreCompact":         [{ "hooks": [{ "type": "command", "command": "cli-rts emit pre-compact", "async": true }] }]
  }
}
```

Each `cli-rts emit <event>` command reads JSON from stdin and forwards it to the daemon via IPC (Unix socket or localhost HTTP).

---

## Game State Format

The daemon maintains this state in memory and pushes diffs to the web UI over WebSocket.

### Top-Level State

```typescript
interface GameState {
  // Monotonically increasing, bumped on every state change
  tick: number;

  // Unix timestamp of last state change
  timestamp: number;

  // The repo this game world represents
  repo: {
    path: string;         // absolute path to repo root
    name: string;         // directory name
  };

  // Map derived from repo structure (see Sprint 2)
  map: GameMap;

  // Players keyed by session_id
  players: Record<string, Player>;

  // Active objectives/tasks
  objectives: Record<string, Objective>;

  // Recent event log for the activity feed
  eventLog: GameEvent[];
}
```

### Player

```typescript
interface Player {
  sessionId: string;
  status: "active" | "idle" | "disconnected";
  model: string;                    // e.g., "claude-opus-4-6"
  permissionMode: string;           // e.g., "default", "bypassPermissions"
  color: PlayerColor;               // assigned on join (player 1 = blue, player 2 = red, etc.)
  joinedAt: number;                 // unix timestamp
  lastActivityAt: number;           // unix timestamp

  // The commander unit (main agent)
  commander: Unit;

  // Subagent units keyed by agent_id
  units: Record<string, Unit>;

  // Stats
  stats: {
    toolCallsTotal: number;
    toolCallsFailed: number;
    filesRead: number;
    filesWritten: number;
    bashCommandsRun: number;
    subagentsSpawned: number;
  };
}
```

### Unit

```typescript
interface Unit {
  id: string;                       // session_id for commander, agent_id for subagents
  type: UnitType;
  displayName: string;              // e.g., "Commander", "Scout-1", "Warrior-2"
  status: UnitStatus;
  position: MapPosition;            // current position on the game map
  targetPosition: MapPosition | null; // where the unit is moving to (for interpolation)

  // What the unit is currently doing
  currentAction: UnitAction | null;

  // Lifecycle
  spawnedAt: number;
  lastActionAt: number;
  clearedAt?: number;   // set on /clear rebirth; triggers dissolve/reform animation in renderer
}

type UnitType =
  | "commander"        // main agent
  | "scout"            // Explore subagent
  | "warrior"          // Bash subagent
  | "strategist"       // Plan subagent
  | "soldier"          // general-purpose subagent
  | "specialist";      // custom agent type

type UnitStatus =
  | "spawning"         // warp-in animation
  | "idle"             // standing around
  | "moving"           // traveling to a new position
  | "acting"           // performing a tool action
  | "waiting"          // awaiting permission
  | "failed"           // last action failed (brief state)
  | "despawning";      // warp-out animation

interface UnitAction {
  toolUseId: string;              // correlates PreToolUse with PostToolUse
  toolName: string;               // "Read", "Edit", "Bash", etc.
  actionType: ActionType;         // RTS-friendly action category
  target: string;                 // file path, command, URL, etc.
  startedAt: number;
  description: string;            // human-readable, e.g., "Reading src/auth/login.ts"
}

type ActionType =
  | "scouting"         // Read, Glob, Grep
  | "building"         // Write, Edit
  | "attacking"        // Bash
  | "summoning"        // Task (spawning subagent)
  | "researching"      // WebFetch, WebSearch
  | "special";         // MCP tools
```

### Map Position

```typescript
interface MapPosition {
  // Region corresponds to a directory in the repo
  region: string;        // e.g., "src/auth", "tests", "docs"

  // X/Y coordinates within the game map (computed from repo structure)
  x: number;
  y: number;
}
```

### Game Map

```typescript
interface GameMap {
  width: number;
  height: number;

  // Regions derived from repo directory structure
  regions: Record<string, MapRegion>;
}

interface MapRegion {
  id: string;             // directory path relative to repo root
  label: string;          // display name
  bounds: {               // bounding box on the game map
    x: number;
    y: number;
    width: number;
    height: number;
  };
  terrain: TerrainType;   // visual style
  fileCount: number;      // number of files in this directory
  children: string[];     // sub-region IDs
}

type TerrainType =
  | "base"               // project root
  | "source"             // src/, lib/ — green terrain
  | "test"               // tests/, __tests__ — red/orange terrain
  | "config"             // config files, dotfiles — rocky terrain
  | "docs"               // docs/, *.md — sandy terrain
  | "build"              // dist/, build/ — industrial terrain
  | "assets"             // images, fonts — decorative terrain
  | "external";          // outside the repo (web fetches)
```

### Objective

```typescript
interface Objective {
  taskId: string;
  subject: string;
  description?: string;
  status: "active" | "completed";
  completedAt?: number;
  position?: MapPosition;   // optional: place objective marker on map
}
```

### Game Event

```typescript
interface GameEvent {
  id: string;
  tick: number;
  timestamp: number;
  playerId: string;        // session_id
  unitId: string;          // unit that triggered the event
  type: GameEventType;
  data: Record<string, any>;
  message: string;         // human-readable event description for the feed
}

type GameEventType =
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
  | "session_clear";    // /clear boundary: same player, memory wiped (renders as ↺ divider)
```

---

## WebSocket Protocol

The daemon pushes state changes to the browser over WebSocket.

### Server → Client Messages

```typescript
// Full state snapshot (sent on initial connection)
{ type: "snapshot", state: GameState }

// Incremental update (sent on each state change)
{ type: "event", event: GameEvent, patches: StatePatch[] }
```

### StatePatch

Uses JSON Patch (RFC 6902) format for efficient incremental updates:

```typescript
interface StatePatch {
  op: "add" | "replace" | "remove";
  path: string;          // JSON pointer, e.g., "/players/abc123/commander/status"
  value?: any;
}
```

### Client → Server Messages

```typescript
// Request full state snapshot
{ type: "sync" }

// Subscribe to specific players (future: for spectator mode)
{ type: "subscribe", playerIds: string[] }
```

---

## Event Processing Pipeline

```
Hook fires (async)
    │
    ▼
cli-rts emit <event>     ← reads JSON from stdin
    │
    ▼
IPC to daemon             ← Unix socket or localhost HTTP POST
    │
    ▼
Daemon event handler      ← updates GameState, increments tick
    │
    ▼
Generate patches          ← diff old state vs new state
    │
    ▼
WebSocket broadcast       ← push { event, patches } to all connected browsers
    │
    ▼
Browser game loop         ← apply patches, animate units, render frame
```

---

## Open Questions for Next Sprints

- **Map generation algorithm**: How to convert `repo directory tree → MapRegion bounds` (Sprint 2)
- **Unit positioning within regions**: When multiple units are in the same region, how to avoid overlap
- **Movement interpolation**: How units visually travel between regions (pathfinding? straight line?)
- **Idle behavior**: What units do between tool calls (wander? play idle animation?)
- **State persistence**: Should game state survive daemon restarts? (probably not for MVP)
