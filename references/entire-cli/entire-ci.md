# Entire CLI - Architecture & Agent Integration

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent (runtime)                      │
│                                                             │
│  ┌──────────────┐              ┌──────────────────┐         │
│  │  Claude Code  │              │   Gemini CLI     │         │
│  │              │              │                  │         │
│  │ .claude/     │              │ .gemini/         │         │
│  │ settings.json│              │ settings.json    │         │
│  │  (hooks)     │              │  (hooksConfig)   │         │
│  └──────┬───────┘              └────────┬─────────┘         │
│         │ fires hook                    │ fires hook        │
│         │ (JSON on stdin)               │ (JSON on stdin)   │
└─────────┼───────────────────────────────┼───────────────────┘
          │                               │
          ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│              entire hooks <agent> <verb>                     │
│                                                             │
│  hooks_cmd.go ─── hookRegistry lookup ──► handler function  │
│                                                             │
│  ┌────────────────────┐    ┌─────────────────────────┐      │
│  │ claudecode/         │    │ geminicli/               │      │
│  │  ParseHookInput()   │    │  ParseHookInput()        │      │
│  │  ReadSession()      │    │  ReadSession()           │      │
│  │  ExtractPrompts()   │    │  ExtractPrompts()        │      │
│  └─────────┬──────────┘    └────────────┬────────────┘      │
│            │                            │                   │
│            ▼    Normalized HookInput    ▼                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │          Shared Handler Logic                     │       │
│  │  handleSessionStartCommon()                       │       │
│  │  captureInitialState() / commitWithMetadata()     │       │
│  └───────────────────────┬──────────────────────────┘       │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────┐       │
│  │       Strategy Layer (manual-commit / auto-commit)│       │
│  │  SaveChanges()  Rewind()  GetRewindPoints()       │       │
│  └───────────────────────┬──────────────────────────┘       │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────┐       │
│  │       Git (shadow branches, metadata branch)      │       │
│  │  entire/<hash>-<worktreeHash>  (temporary)        │       │
│  │  entire/checkpoints/v1         (permanent)        │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Hook Installation Flow

When a user runs `entire enable`, the CLI writes hook entries into the agent's settings file.

### Claude Code

Writes to `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "command": "entire hooks claude-code stop" }],
    "UserPromptSubmit": [{ "command": "entire hooks claude-code user-prompt-submit" }],
    "SessionStart": [{ "command": "entire hooks claude-code session-start" }],
    "SessionEnd": [{ "command": "entire hooks claude-code session-end" }],
    "PreToolUse": [{ "command": "entire hooks claude-code pre-task", "matcher": "Task" }],
    "PostToolUse": [{ "command": "entire hooks claude-code post-task", "matcher": "Task" }]
  }
}
```

### Gemini CLI

Writes to `.gemini/settings.json`:

```json
{
  "hooksConfig": {
    "enabled": true,
    "hooks": {
      "SessionStart": [{ "command": "entire hooks gemini session-start" }],
      "BeforeAgent":  [{ "command": "entire hooks gemini before-agent" }],
      "AfterAgent":   [{ "command": "entire hooks gemini after-agent" }],
      "BeforeTool":   [{ "command": "entire hooks gemini before-tool", "matcher": "*" }]
    }
  }
}
```

## How Prompts Are Captured

There are two mechanisms, used at different times:

```
                    ┌─────────────────────────────────┐
                    │    Prompt Capture Mechanisms     │
                    └─────────────────────────────────┘

  1. REAL-TIME (from hook JSON payload)
  ─────────────────────────────────────
  Agent fires hook ──► stdin JSON ──► ParseHookInput() ──► input.UserPrompt

  Claude: UserPromptSubmit → {"prompt": "fix the bug"}
  Gemini: BeforeAgent      → {"prompt": "fix the bug"}


  2. POST-HOC (from transcript file)
  ─────────────────────────────────────
  Agent writes transcript ──► ReadSession() ──► ExtractLastUserPrompt()

  Claude: JSONL format  →  scan for {type:"user", message:{content:"..."}}
  Gemini: JSON format   →  scan for {type:"user", content:"..."}
```

### Real-Time Capture

When the hook fires, the agent provides the user's prompt directly in the JSON payload:

- **Claude Code**: `UserPromptSubmit` hook sends `{"session_id": "...", "transcript_path": "...", "prompt": "..."}` on stdin.
- **Gemini CLI**: `BeforeAgent` hook sends `{"session_id": "...", "transcript_path": "...", "prompt": "..."}` on stdin.

Both are parsed by agent-specific `ParseHookInput()` into the normalized `input.UserPrompt` field.

### Post-Hoc Transcript Parsing

After a turn completes, the CLI reads the agent's transcript file:

- **Claude Code** (`transcript.go`): JSONL format. Each line is `{type: "user"|"assistant", message: {content: "..."}}`. `ExtractLastUserPrompt()` walks lines backward to find the last `type == "user"` entry.
- **Gemini CLI** (`transcript.go`): Single JSON file with `{messages: [...]}`. Messages have `{type: "user"|"gemini", content: "..."}`. Iterates to collect user messages.

## Agent Abstraction Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                     agent.Agent Interface                        │
├─────────────────────────────────────────────────────────────────┤
│  Name() / Type() / Description()                                │
│  DetectPresence()          ← checks for .claude/ or .gemini/    │
│  ParseHookInput()          ← normalizes agent-specific JSON     │
│  ReadSession() / WriteSession()                                  │
│  ProtectedDirs()           ← dirs to never delete on rewind     │
│  FormatResumeCommand()                                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐  ┌─────▼────────┐  ┌────▼──────────┐
     │  Claude Code   │  │  Gemini CLI   │  │  Future Agent  │
     │                │  │               │  │  (e.g. Cursor) │
     │ claudecode/    │  │ geminicli/    │  │ cursor/        │
     │  claude.go     │  │  gemini.go    │  │  cursor.go     │
     │  hooks.go      │  │  hooks.go     │  │  hooks.go      │
     │  transcript.go │  │  transcript.go│  │  transcript.go │
     │  types.go      │  │  types.go     │  │  types.go      │
     └───────────────┘  └──────────────┘  └───────────────┘
```

### Optional Interfaces

Agents can opt into additional capabilities:

| Interface | Purpose | Implemented By |
|---|---|---|
| `HookSupport` | Install/uninstall/check hooks in agent settings | Claude Code, Gemini CLI |
| `HookHandler` | Define agent-specific hook vocabulary (verb names) | Claude Code, Gemini CLI |
| `FileWatcher` | File-based session detection (no hooks needed) | Designed for Aider/future agents |
| `TranscriptAnalyzer` | Transcript position tracking and incremental file extraction | Claude Code, Gemini CLI |
| `TranscriptChunker` | Split large transcripts for storage (100MB GitHub limit) | Claude Code, Gemini CLI |

### Registry Pattern

Uses a factory pattern with self-registration via `init()`:

```go
// In claudecode/claude.go init():
agent.Register(agent.AgentNameClaudeCode, NewClaudeCodeAgent)

// In geminicli/gemini.go init():
agent.Register(agent.AgentNameGemini, NewGeminiCLIAgent)
```

Key functions:
- `agent.Get(name)` - Create agent by name
- `agent.List()` - List registered agent names
- `agent.Detect()` - Auto-detect agent by checking `DetectPresence()` on each registered agent
- `agent.AllProtectedDirs()` - Union of all agents' protected directories

## How the Abstraction Supports Future Agents

Adding support for a new agent (e.g., Cursor, Aider, Copilot) requires:

1. **Create a new package** under `cmd/entire/cli/agent/<name>/`
2. **Implement the `Agent` interface** (and optionally `HookSupport`, `FileWatcher`, `TranscriptAnalyzer`)
3. **Self-register** with `agent.Register("agent-name", NewAgentFunc)` in `init()`
4. **Add a blank import** `_ "github.com/entireio/cli/cmd/entire/cli/agent/<name>"` in `hooks_cmd.go`
5. **Register hook handlers** in `hook_registry.go`
6. **Create handler file** `hooks_<agentname>_handlers.go` for agent-specific logic

No changes are needed to the strategy layer, checkpoint storage, or session management.

### Key Design Decisions

- **Interface segregation**: The `FileWatcher` interface exists for agents that don't have a hook system (like Aider), allowing file-based detection instead of hook callbacks.
- **Normalized data model**: Agent-specific JSON gets parsed into a common `HookInput` struct, so all downstream logic is agent-agnostic.
- **Strategy independence**: The checkpoint/storage strategy (manual-commit vs auto-commit) is completely decoupled from which agent is used.

## Hook Event Mapping

Different agents use different event names for the same logical concept:

| Logical Event | Claude Code | Gemini CLI |
|---|---|---|
| User submits prompt | `UserPromptSubmit` | `BeforeAgent` |
| Agent finishes responding | `Stop` | `AfterAgent` |
| Session starts | `SessionStart` | `SessionStart` |
| Session ends | `SessionEnd` | `SessionEnd` |
| Before tool use | `PreToolUse` | `BeforeTool` |
| After tool use | `PostToolUse` | `AfterTool` |

### Normalized Hook Types

| HookType | Value | Description |
|---|---|---|
| `HookSessionStart` | `"session_start"` | New session begins |
| `HookSessionEnd` | `"session_end"` | Session explicitly closed |
| `HookUserPromptSubmit` | `"user_prompt_submit"` | User submits a prompt |
| `HookStop` | `"stop"` | Agent finishes responding |
| `HookPreToolUse` | `"pre_tool_use"` | Before tool execution |
| `HookPostToolUse` | `"post_tool_use"` | After tool execution |

## Session Lifecycle (Hook Event Flow)

```
User opens agent          Agent processes             User commits
      │                        │                           │
      ▼                        ▼                           ▼
 SessionStart ──►  UserPromptSubmit/BeforeAgent ──►  Stop/AfterAgent
      │                   │                              │
      │            captureInitialState()          commitWithMetadata()
      │            ┌─ save pre-prompt state        ┌─ read transcript
      │            ├─ strategy.EnsureSetup()       ├─ extract prompts
      │            └─ strategy.InitSession()       ├─ extract modified files
      │                                            ├─ strategy.SaveChanges()
      │                                            └─ save checkpoint
      │                                                  │
      │                        ┌──────────────────────────┘
      │                        ▼
      │              Session Phase Machine
      │         ┌──────────────────────────┐
      │         │ IDLE ←──► ACTIVE          │
      │         │   │         │             │
      │         │   │    git commit?        │
      │         │   │         ▼             │
      │         │   │   ACTIVE_COMMITTED    │
      │         │   │         │             │
      │         │   ▼    turn ends          │
      │         │ condense to               │
      │         │ entire/checkpoints/v1     │
      │         └──────────────────────────┘
      │
 SessionEnd ──► mark ENDED, final condense
```

### Session Phase State Machine

**Phases:** `ACTIVE`, `ACTIVE_COMMITTED`, `IDLE`, `ENDED`

**Events:**
- `EventTurnStart` - Maps from `UserPromptSubmit` / `BeforeAgent`
- `EventTurnEnd` - Maps from `Stop` / `AfterAgent`
- `EventGitCommit` - Maps from git `post-commit` hook
- `EventSessionStart` - Maps from `SessionStart`
- `EventSessionStop` - Maps from `SessionEnd`

**Key transitions:**
- `IDLE + TurnStart → ACTIVE` - Agent starts working
- `ACTIVE + TurnEnd → IDLE` - Agent finishes turn
- `ACTIVE + GitCommit → ACTIVE_COMMITTED` - User commits while agent is working (condensation deferred)
- `ACTIVE_COMMITTED + TurnEnd → IDLE` - Agent finishes after commit (condense now)
- `IDLE + GitCommit → IDLE` - User commits between turns (condense immediately)
- `ENDED + GitCommit → ENDED` - Post-session commit (condense if files touched)

The state machine emits **actions** (e.g., `ActionCondense`, `ActionMigrateShadowBranch`, `ActionDeferCondensation`) that hook handlers dispatch to strategy-specific implementations.

## Git Hooks (Strategy-Level)

Separately from agent hooks, the strategy layer installs git hooks (`strategy/hooks.go`):

| Git Hook | Command | Purpose |
|---|---|---|
| `prepare-commit-msg` | `entire hooks git prepare-commit-msg` | Adds `Entire-Checkpoint` trailer to user commits |
| `commit-msg` | `entire hooks git commit-msg` | Strips trailer if no user content |
| `post-commit` | `entire hooks git post-commit` | Condenses session data on commit |
| `pre-push` | `entire hooks git pre-push` | Pushes `entire/checkpoints/v1` alongside user pushes |

These are agent-agnostic.

## Handler Dispatch Chain

```
Agent fires hook
      │
      ▼
entire hooks <agent> <verb>          (hooks_cmd.go)
      │
      ▼
hookRegistry[agentName][hookName]    (hook_registry.go)
      │
      ▼
Agent-specific handler               (hooks_<agent>_handlers.go)
      │
      ├─► Agent ParseHookInput()     (normalize JSON)
      ├─► Agent-specific logic       (transcript parsing, etc.)
      │
      ▼
Shared handler logic                 (handleSessionStartCommon, etc.)
      │
      ▼
Strategy.SaveChanges() / etc.        (strategy layer)
      │
      ▼
Git operations                       (shadow branches, metadata branch)
```

## Summary

The Entire CLI acts as a **passive observer** that hooks into AI agents' lifecycle events. It never modifies the agent's behavior - it only captures state. The architecture is built around:

- **Interface segregation**: Core `Agent` interface for all agents, optional capability interfaces for agent-specific features
- **Registry pattern**: Self-registering agents with auto-detection
- **Normalized data model**: Agent-specific JSON parsed into common `HookInput` struct
- **Strategy independence**: Checkpoint/storage strategy is completely decoupled from the agent
- **Extensibility**: Adding a new agent requires no changes to the strategy, checkpoint, or session layers
