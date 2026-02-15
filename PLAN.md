# PLAN.md

## Project Purpose

CLI-RTS is a Real-Time Strategy Visualization tool that hooks into coding AI agents (like Claude Code) and visualizes them as units in a strategy game.

### Core Concept

- Read the current state of AI coding agents (starting with Claude Code)
- Treat each agent/subagent as a "unit" in an RTS-style visualization
- Map agent activities to different unit types based on what the agent is doing (e.g., exploring code, writing files, running tests)

### Key Decisions

- **Rendering target**: Local web UI — the game runs in the browser
- **Communication**: Persistent daemon process, async hooks so we never block agents
- **Hook location**: Project-level `.claude/settings.json` (committable, per-repo)
- **Multi-agent**: Support multiple agent types (Claude Code, Gemini CLI, etc.) in the same repo
- **Concurrent sessions**: Treated as different "players" in the RTS game
- **Scope**: Single repo, local machine only
- **Visual fidelity**: StarCraft Brood War level (isometric 2D, pixel art sprites)
- **Time**: Real-time visualization of live agent activity

## Risks & Unknowns (ranked by severity)

### Existential Risks

**1. ~~Hook payload data richness~~ — RESOLVED**
Confirmed via official docs: PreToolUse/PostToolUse include `tool_name` + full `tool_input` (file paths, commands, patterns). SubagentStart/SubagentStop provide `agent_id` + `agent_type` for parent→child correlation. All 14 event types have well-documented payloads. See `GAME-STATE-SPEC.md` for the full mapping.

**2. Subagent correlation**
The RTS feel comes from one player commanding multiple units. When a parent session spawns a Task, we need to link the child's events back to the parent. If `session_id` changes for subagents with no parent reference, they'd appear as separate players instead of units under one commander.

### High Risk

**3. Repo-to-map translation**
No obvious "right" mapping from a directory tree to 2D terrain. Needs to work for repos of wildly different sizes and structures. Likely requires several design iterations.

**4. Art asset pipeline at BW fidelity**
BW has thousands of frames of hand-pixeled animation. Even a minimal unit set (5 types x idle/move/action x 8 directions) is 120+ sprite frames. Source and pipeline TBD.

### Medium Risk

**5. Real-time pipeline latency**
Hook → IPC → daemon → WebSocket → browser. Needs <200ms end-to-end for real-time feel.

**6. Game loop vs event-driven tension**
RTS games run continuous render loops. Our data is sporadic hook events. Between events, units need believable behavior (idle animations, movement interpolation) to feel alive.

### Lower Risk

**7. Concurrent session state management** — Standard engineering, needs clean architecture.

**8. Multi-agent adapter pattern** — Entire CLI already solved this. We can borrow their registry/interface approach.

## Research Sprints

### Sprint 1: Prove the data exists (de-risks #1 and #2)

Goal: Determine exactly what data Claude Code provides in each hook event payload.

Questions:
- [x] What fields are in each hook event's JSON payload?
- [x] Does `PreToolUse`/`PostToolUse` include tool name and parameters?
- [x] When a Task is spawned, does the subagent get a linked session_id or a completely new one?
- [x] Can we correlate subagent events back to their parent session?

Status: **COMPLETE** — See findings below.

#### Findings

**14 hook event types available** (more than reference projects used):
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop`, `TeammateIdle`, `TaskCompleted`, `PreCompact`, `SessionEnd`

**Common fields in ALL payloads:**
`session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`

**PreToolUse/PostToolUse payloads include:**
- `tool_name` — exact tool name (Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, WebSearch, mcp__*)
- `tool_input` — complete input parameters (file_path, command, pattern, etc.)
- `tool_use_id` — unique ID per tool invocation (correlates Pre with Post)
- PostToolUse also includes `tool_response` with the tool's output

**Subagent correlation is possible:**
- `SubagentStart` fires with `agent_id` (unique) + `agent_type` (Explore, Bash, Plan, etc.)
- `SubagentStop` fires with the **parent's `session_id`** + the subagent's `agent_id`
- This lets us build parent→child trees for the multi-unit RTS model
- Tool events (PreToolUse/PostToolUse) fire for both parent and subagent tool calls

**Async is supported:** All command hooks can set `"async": true` to avoid blocking agents.

**Conclusion:** The hook data is rich enough to drive the full RTS visualization — unit types from tool_name, map positions from file paths in tool_input, player identity from session_id, and command hierarchy from SubagentStart/SubagentStop correlation.

### Sprint 2: Prove the map concept (de-risks #3)

Goal: Figure out how to translate a codebase into a compelling 2D RTS map.

Questions:
- [ ] What existing code-to-spatial-visualization tools exist? (Gource, CodeCity, repo-visualizer)
- [ ] What mapping strategies work? (directory → region, import graph → proximity, file type → terrain)
- [ ] Isometric (like BW) or top-down?
- [ ] How to handle repos of very different sizes without sparse/dense extremes?

Status: **NOT STARTED**

### Sprint 3: Prove the art is feasible (de-risks #4)

Goal: Determine if we can achieve BW-level visual fidelity and what asset pipeline to use.

Questions:
- [ ] What open-source RTS sprite packs exist? (OpenGameArt, itch.io)
- [ ] What's the minimum viable unit set for MVP?
- [ ] Can we prototype one unit (idle/move/action) in Phaser or PixiJS?
- [ ] Can we get "BW feel" without commissioning custom pixel art?

Status: **NOT STARTED**

### Sprint 4: Architecture & stack (informed by sprints 1-3)

Goal: Choose the tech stack and design the system architecture.

Questions:
- [ ] Daemon language (Node.js, Go, Python, Rust)?
- [ ] IPC mechanism (Unix socket, localhost HTTP, named pipe)?
- [ ] Web game framework (Phaser, PixiJS, raw Canvas/WebGL)?
- [ ] How does the event-driven data feed into a continuous game loop?
- [ ] How to handle multi-agent adapter registration (borrow from Entire's pattern)?

Status: **NOT STARTED**

## Ecosystem Research

### Architecture Patterns

Five patterns found in the wild for building on Claude Code hooks:

1. **Stateless scripts** (most common) — Standalone Python/JS files in `.claude/hooks/`. Each invocation reads stdin, processes, exits. No shared state. (e.g., `disler/claude-code-hooks-mastery`, 3k+ stars)
2. **Compiled executable** — All hooks bundled into one binary for performance. Avoids shell startup overhead. (e.g., `carlrannaberg/claudekit`, TypeScript→JS)
3. **Hook→Server daemon** (most relevant to us) — Stateless hook scripts POST events via HTTP to a long-running server, which stores in SQLite and pushes via WebSocket to a web UI. Proven pipeline: hook → HTTP POST → Bun server → SQLite → WebSocket → Vue dashboard.
4. **Copy-paste collections** — Ready-to-use scripts organized by event type
5. **CLI tool as hook** — A compiled binary called by multiple hook events, reading shared state from a data file

**Our architecture matches pattern #3.** The observability dashboard project proves the full pipeline works end-to-end.

### Testing Patterns

No dedicated mock framework exists for Claude Code hooks. Common approaches:

- **Manual stdin piping**: `echo '{"tool_name":"Bash",...}' | ./hook.sh` + check exit code
- **Custom Bash test framework** (claudekit): assertions (`assert_equals`, `assert_json_field`), mocking of `git`/`npm`, isolated temp dirs
- **Node.js test runner**: unit tests per event type with stdin/stdout flow testing
- **System validation scripts**: start server, send mock events via curl, verify dashboard
- **Structured JSON logging**: every hook writes to a log file as both audit trail and validation

### Pitfalls to Avoid

- Shell profile `echo` statements break JSON parsing on stdout
- Stop hooks without `stop_hook_active` check → infinite loops
- Exit code 2 ignores all JSON output (pick one signaling approach)
- Settings changes need session restart (snapshot captured at startup)
- Slow hooks (>5s) degrade UX — always use `async: true` for observability hooks
- Unbounded context injection wastes tokens (claudekit caps at 10k chars)

## Specs

### Game State Spec
- Hook-to-RTS state mapping for all 14 Claude Code hook events
- Full TypeScript interfaces for game state (Player, Unit, Map, Objectives, Events)
- WebSocket protocol design (snapshot + JSON Patch diffs)
- Hook installation configuration (all async)
- See: `GAME-STATE-SPEC.md`

## Reference Projects

### Entire CLI
- Go CLI that hooks into Claude Code and Gemini CLI via their hook systems
- Uses agent abstraction layer with registry pattern for multi-agent support
- Captures state via hook JSON payloads + post-hoc transcript parsing
- See: `entire-cli/entire-ci.md`

### peon-ping
- Shell script that hooks into Claude Code to play sound effects on agent lifecycle events
- Maps hook events to sound categories (session.start, task.complete, input.required)
- Uses `.state.json` for persistence across hook invocations
- Demonstrates async hook execution to avoid blocking the agent
- See: `peon-ping/ENGINE-DESIGN.md`

### Open Source Hook Projects (TODO: review)

- [x] **disler/claude-code-hooks-multi-agent-observability** — Investigated. Uses HTTP POST from Python hook scripts to a Bun server with SQLite + WebSocket→Vue. Key learnings: `send_event.py` pattern for hook→server forwarding, always exit 0, promote event-specific fields as top-level. We differ in using in-memory game state (not event log), game state patches (not raw events), and a compiled binary (not Python/uv). See: `references/multi-agent-observability/ANALYSIS.md`
- [ ] **disler/claude-code-hooks-mastery** (3k+ stars) — Comprehensive 13-hook Python/uv reference. Study their hook script structure, JSON logging, and event handling patterns.
- [ ] **carlrannaberg/claudekit** (593 stars) — Compiled TypeScript toolkit. Study their custom Bash test framework (assertions, mocking, fixtures) and hook profiling system.
- [ ] **karanb192/claude-code-hooks** (143 stars) — JS hook collection with Node.js test runner. Study their per-event-type test organization and safety-level tiering.
- [ ] **nizos/tdd-guard** — TDD enforcement via hooks. Study their cross-framework reporter pattern (shared data file consumed by a single hook binary).
- [ ] **anthropics/claude-code examples/hooks/** — Official reference implementation (`bash_command_validator_example.py`). Study the canonical guard/validator pattern.
