# Analysis: disler/claude-code-hooks-multi-agent-observability

## Architecture Overview

```
Claude Code Hook Events → Python scripts (uv) → HTTP POST → Bun Server (:4000) → SQLite (WAL) → WebSocket → Vue 3 Client (:5173)
```

## Data Flow

### 1. Hook Layer (Python/uv)

Each hook event triggers two things in `.claude/settings.json`:
- A **local script** (e.g., `pre_tool_use.py`) for validation/logging
- A **universal sender** (`send_event.py`) that POSTs to the server

`send_event.py` is the key piece:
- Reads hook JSON from stdin
- Extracts event-specific fields (tool_name, agent_id, etc.) as top-level properties
- POSTs to `http://localhost:4000/events` with 5-second timeout
- Always exits 0 (never blocks the agent)
- Optionally generates AI summaries via `utils/summarizer.py`
- Optionally extracts model name from transcript

**Event payload sent to server:**
```python
{
    'source_app': 'my-project',           # Project identifier
    'session_id': 'abc123',               # Claude session ID
    'hook_event_type': 'PreToolUse',      # Event type
    'payload': { ... },                   # Full hook JSON from stdin
    'timestamp': 1708000000000,           # Unix ms
    'model_name': 'claude-opus-4-6',      # From transcript
    'tool_name': 'Bash',                  # Promoted for easy querying
    'tool_use_id': 'toolu_01ABC',         # Promoted for easy querying
    'summary': '...',                     # Optional AI summary
    'chat': [ ... ],                      # Optional full transcript
}
```

### 2. Server (Bun + SQLite)

**SQLite schema (single `events` table):**
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_app TEXT NOT NULL,
  session_id TEXT NOT NULL,
  hook_event_type TEXT NOT NULL,
  payload TEXT NOT NULL,          -- Full hook JSON as string
  chat TEXT,                      -- Optional transcript
  summary TEXT,                   -- Optional AI summary
  timestamp INTEGER NOT NULL,
  humanInTheLoop TEXT,            -- HITL request metadata
  humanInTheLoopStatus TEXT,      -- HITL response status
  model_name TEXT
);

CREATE INDEX idx_source_app ON events(source_app);
CREATE INDEX idx_session_id ON events(session_id);
CREATE INDEX idx_hook_event_type ON events(hook_event_type);
CREATE INDEX idx_timestamp ON events(timestamp);
```

**Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/events` | POST | Receive events from hooks |
| `/events/recent` | GET | Paginated retrieval (default 300) |
| `/events/filter-options` | GET | Available filter values |
| `/events/{id}/respond` | POST | Human-in-the-loop responses |
| `/stream` | WebSocket | Real-time broadcasting |

**Key details:**
- SQLite WAL mode for concurrent reads/writes
- On POST: insert to DB, then broadcast to all WebSocket clients
- Validates required fields (source_app, session_id, hook_event_type, payload)

### 3. WebSocket Protocol

```typescript
// On client connect: send recent 300 events
{ type: 'initial', data: HookEvent[] }

// On each new event: broadcast to all clients
{ type: 'event', data: HookEvent }

// On HITL response
{ type: 'hitl_response', data: HumanInTheLoopResponse }
```

Client auto-reconnects after 3 seconds on disconnect.

### 4. Client (Vue 3)

- `useWebSocket.ts` composable manages connection and event buffering
- On connect: receives last 300 events as initial snapshot
- On new event: appends to in-memory array, trims to max (configurable via `VITE_MAX_EVENTS_TO_DISPLAY`)
- Event types have emoji/color mapping for visual distinction
- Dual-color system: app color (left border) + session color (second border)
- Live pulse chart (canvas-based) with session-specific bars

### 5. Local Logging (Optional, Independent)

Hook scripts also write JSON to `logs/{session_id}/` as an audit trail, separate from server storage.

## Concurrent Session Handling

- Each session identified by `source_app + session_id`
- Displayed as `"source_app:session_id"` (truncated to 8 chars)
- Each session gets a unique color in the UI
- Filter panel allows inspecting individual sessions
- SQLite indexes enable fast per-session queries

## Key Takeaways for cli-rts

### What to borrow
- **`send_event.py` pattern** → model for our `cli-rts emit` command (read stdin, POST to daemon)
- **HTTP POST for IPC** → proven, simple, reliable. 5-second timeout is reasonable
- **Always exit 0** → never block the agent, even if the server is down
- **Promote event-specific fields** → extract tool_name, agent_id, etc. as top-level for easy processing
- **WebSocket for real-time push** → works well, auto-reconnect is essential

### What to do differently
- **No SQLite for MVP** → we maintain game state in memory, not event history
- **Game state patches instead of raw events** → they push raw events; we need JSON Patch diffs of game state
- **Snapshot on connect** → they send 300 raw events; we send the full GameState object
- **Single binary instead of Python scripts** → our `cli-rts emit` should be a compiled command, not a Python script requiring uv
- **Game loop on client** → they render a timeline; we run a continuous game loop with animation

### Architecture comparison

| Aspect | Their System | cli-rts |
|--------|-------------|---------|
| Hook script | Python/uv (`send_event.py`) | Compiled binary (`cli-rts emit`) |
| IPC | HTTP POST | HTTP POST (same) |
| Server storage | SQLite (event log) | In-memory (game state) |
| Server push | Raw events via WebSocket | Game state patches via WebSocket |
| Client | Vue 3 timeline/dashboard | Phaser/PixiJS game renderer |
| Reconnect | Replay last 300 events | Full GameState snapshot |
