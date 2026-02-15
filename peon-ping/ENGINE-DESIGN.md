# peon-ping Engine Design

How peon-ping hooks into Claude Code and turns IDE lifecycle events into sound effects, desktop notifications, and mobile push alerts.

## Architecture Diagram

<p align="center">
<img src="docs/engine-diagram.svg" alt="peon-ping engine architecture" width="900">
</p>

## How Hooking Works

Claude Code has a built-in **hooks system** — a way to run arbitrary shell commands in response to lifecycle events. Hooks are registered in `~/.claude/settings.json` under the `hooks` key. Each hook entry specifies a shell command, a timeout, and whether it runs synchronously or asynchronously.

The **installer** (`install.sh:711-765`) writes entries into `settings.json` for six Claude Code events:

| Claude Code Event     | Hook Mode | CESP Category Mapped To   |
|----------------------|-----------|---------------------------|
| `SessionStart`       | **sync**  | `session.start`           |
| `SessionEnd`         | async     | *(cleanup only)*          |
| `UserPromptSubmit`   | async     | `user.spam` (if rapid)    |
| `Stop`               | async     | `task.complete`           |
| `Notification`       | async     | *(tab title only)*        |
| `PermissionRequest`  | async     | `input.required`          |

`SessionStart` is the only sync hook — it needs to print stderr messages (update notices, pause status, relay guidance) that appear immediately in the terminal. All others are async so the IDE never blocks waiting on audio playback.

### The Hook Entry in settings.json

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/you/.claude/hooks/peon-ping/peon.sh",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ]
  }
}
```

When Claude Code fires an event, it:
1. Serializes event context as JSON (event name, session ID, cwd, permission mode, etc.)
2. Pipes that JSON into the hook command's **stdin**
3. Captures stdout (for hook responses) and stderr (for user-visible messages)

## Key Files

| File | Purpose |
|------|---------|
| **`peon.sh`** | Main engine. Receives JSON on stdin, runs a single embedded Python block that handles config loading, event parsing, CESP category mapping, pack rotation, sound selection (no-repeat), and state management. Shell code then handles async audio playback, desktop notifications, mobile push, and tab title updates. |
| **`install.sh`** | Installer. Downloads packs from the OpenPeon registry, copies core files, and **registers hooks** in `~/.claude/settings.json` by writing JSON entries for all six events. |
| **`config.json`** | User configuration. Volume, enabled categories, pack rotation settings, notification preferences, mobile push config. |
| **`.state.json`** | Runtime state persisted across invocations. Tracks: agent sessions (suppresses sounds in delegate mode), pack rotation index, prompt timestamps (for spam detection), last-played sounds (no-repeat), stop debouncing, session start times. |
| **`relay.sh`** | HTTP relay server for SSH/devcontainer/Codespaces. Runs on local machine, receives `/play` and `/notify` requests from remote sessions. |
| **`peon.ps1`** | Windows (native PowerShell) implementation — same event flow without Python dependency. |

## Event Processing Pipeline (peon.sh)

### Phase 1: Platform Detection (lines 7-30)
Detects runtime environment: `mac`, `linux`, `wsl`, `ssh`, `devcontainer`. This determines which audio backend and notification system to use.

### Phase 2: CLI Subcommands (lines 599-1288)
If invoked with a CLI argument (`peon pause`, `peon packs use glados`, etc.), handles the command and exits before reading stdin. This is how the `peon` CLI works — same script, different entry point.

### Phase 3: JSON Ingestion (line 1299)
`INPUT=$(cat)` — reads the full JSON event payload from stdin (piped by Claude Code).

### Phase 4: Single Python Evaluation (lines 1310-1672)
One `python3` invocation does everything:

1. **Config loading** — reads `config.json` for volume, categories, pack rotation, thresholds
2. **Event parsing** — extracts `hook_event_name`, `session_id`, `cwd`, `notification_type`
3. **Agent detection** — if `permission_mode` is `delegate`, marks the session as an agent and suppresses all sounds for it
4. **Session cleanup** — expires stale session data older than `session_ttl_days`
5. **Pack rotation** — pins a pack per session using random, round-robin, or agentskill mode
6. **Event routing** — maps the Claude Code event to a CESP category:
   - `SessionStart` → `session.start`
   - `Stop` → `task.complete` (with debouncing and silent window)
   - `PermissionRequest` → `input.required`
   - `UserPromptSubmit` → `user.spam` (only if 3+ prompts in 10s)
7. **Sound selection** — picks a random sound from the active pack's manifest, avoiding the last-played sound per category
8. **State persistence** — writes `.state.json` once at the end
9. **Output** — prints shell variable assignments (`eval`'d by the parent bash process)

### Phase 5: Shell Execution (lines 1674-1781)
Bash consumes the Python output variables and:

1. **Update check** (SessionStart only) — background curl to check for new versions
2. **Tab title** — ANSI escape sequence via `/dev/tty` (bypasses Claude Code stdout capture)
3. **iTerm2 tab color** — OSC 6 escape sequences for status-colored tabs
4. **Audio playback** — platform-dispatched via `play_sound()`:
   - macOS: `nohup afplay -v $vol $file &`
   - Linux: priority chain `pw-play` → `paplay` → `ffplay` → `mpv` → `play` → `aplay`
   - WSL: copies to temp, plays via PowerShell `MediaPlayer`
   - SSH/devcontainer: `curl` to relay server
5. **Desktop notification** — only if terminal is not focused (checked via AppleScript/xdotool)
6. **Mobile push** — ntfy.sh, Pushover, or Telegram (always fires, regardless of focus)

The entire `_run_sound_and_notify` function is backgrounded (`& disown`) in production to avoid blocking the IDE.

## State Machine

```
SessionStart  →  "ready"          →  session.start sound + tab title
UserPromptSubmit  →  "working"    →  tab title only (unless spam detected)
Stop  →  "done"                   →  task.complete sound + notification + tab title
PermissionRequest  →  "needs approval"  →  input.required sound + notification + tab title
Notification(idle_prompt)  →  "done"     →  notification only (no sound)
SessionEnd  →  (cleanup state)    →  no output
```

## Multi-IDE Support

Other IDEs use **adapter scripts** that translate their native event formats into the same JSON structure that `peon.sh` expects:

- `adapters/codex.sh` — OpenAI Codex
- `adapters/cursor.sh` — Cursor (also handled inline via `_cursor_event_map` in `peon.sh`)
- `adapters/opencode/peon-ping.ts` — full TypeScript CESP plugin for OpenCode
- `adapters/kilo.sh` — downloads and patches the OpenCode plugin for Kilo CLI
- `adapters/kiro.sh` — Amazon Kiro
- `adapters/windsurf.sh` — Windsurf Cascade
- `adapters/antigravity.sh` — Google Antigravity (filesystem watcher)
