# Analysis: disler/claude-code-hooks-mastery

Research date: 2026-02-15
Source: https://github.com/disler/claude-code-hooks-mastery (3k+ stars)

## Overview

A comprehensive reference implementation covering all 13 Claude Code hook lifecycle events.
Uses Python + uv single-file scripts. 11 of 13 hooks validated via automated testing.

---

## 1. Hook Script Structure

All hooks live in `.claude/hooks/` as standalone Python files, one per event type:

```
.claude/
  settings.json          # Hook registration + permissions
  hooks/
    user_prompt_submit.py
    pre_tool_use.py
    post_tool_use.py
    stop.py
    notification.py
    ...                  # (13 total, one per lifecycle event)
    validators/
      validate_new_file.py
      ...
```

Key design decisions:
- **One file per hook event type.** Each script handles all logic for its event.
  CLI flags select behavior: `uv run .claude/hooks/user_prompt_submit.py --log-only --store-last-prompt --name-agent`
- **UV single-file scripts** with embedded dependency declarations (PEP 723 inline metadata).
  Keeps hook logic self-contained; no shared virtualenv or requirements.txt needed.
- **`$CLAUDE_PROJECT_DIR` prefix** in settings.json paths for reliable resolution
  across working directories. Critical for subagent scenarios.
- **Validators are separate scripts** under `hooks/validators/`, invoked from
  within the main hook scripts (e.g., pre_tool_use.py calls validate_new_file.py).

### Relevance to cli-rts
We use a similar one-file-per-event approach already. The validators-as-sub-scripts pattern
is worth noting if our hook logic grows complex enough to warrant decomposition.

---

## 2. JSON Logging Patterns

All hook events are automatically logged as JSON to a `logs/` directory.

Standard pattern inside each hook script:

```python
import json, sys, os, datetime
from pathlib import Path

input_data = json.load(sys.stdin)

# Extract event metadata
tool_name = input_data.get("tool_name", "")
tool_input = input_data.get("tool_input", {})

# Structured log entry
log_entry = {
    "timestamp": datetime.datetime.now().isoformat(),
    "hook_type": "pre_tool_use",
    "tool_name": tool_name,
    "tool_input": tool_input,
    # ... additional fields
}

log_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "logs"
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "hooks.jsonl"
with open(log_file, "a") as f:
    f.write(json.dumps(log_entry) + "\n")
```

Key points:
- **JSONL format** (one JSON object per line) for append-friendly logging.
- **Timestamps on every entry** for correlation across hook events.
- Logs capture the full hook payload, not just the fields the hook acts on.
- Chat transcript extraction converts JSONL transcripts to readable JSON for debugging.

### Relevance to cli-rts
Our daemon already uses JSONL. The pattern of logging the full raw payload alongside
derived/processed fields is good practice for debugging game state transitions.

---

## 3. Event Handling Patterns

### Exit Code Protocol
- **Exit 0**: Success. Stdout is processed for JSON or added as context.
- **Exit 2**: Blocking error. Stderr becomes the error message; action is prevented.
  Used by PreToolUse to block dangerous commands.
- **Other exit codes**: Non-blocking errors. Stderr shown only in verbose mode.

### Structured JSON Responses (stdout)
Instead of exit-code-only control, hooks can print JSON to stdout:

```json
{
  "decision": "block",
  "reason": "This command modifies protected files"
}
```

Fields: `decision` (approve/block/allow/deny), `reason`, `continue` (boolean for
Stop hooks), `updatedInput` (modify tool parameters before execution).

### Stop Hook Continuation Pattern
The Stop hook can force Claude to keep working by exiting with code 2 or returning
`"continue": false`. This enables task-completion enforcement.

### Matcher-Based Routing
In settings.json, each hook entry has a `matcher` that filters which events trigger
the script. This avoids running heavy scripts on every event.

### Relevance to cli-rts
The exit-code protocol and JSON response format are the contract we must respect.
The `updatedInput` field is interesting -- it could let us inject game state context
into tool parameters, though we likely want to avoid that complexity initially.

---

## 4. Async Execution and Non-Blocking Patterns

Claude Code supports two hook execution modes:

- **Synchronous (default)**: Claude waits for the hook to finish. Must be fast.
- **Async hooks**: Claude starts the hook process and continues immediately without
  waiting. The hook receives the same JSON input via stdin.

When an async hook's background process exits:
- If it produced JSON with `systemMessage` or `additionalContext`, that content is
  delivered to Claude as context on the **next conversation turn**.
- This is ideal for logging, notifications, analytics -- anything non-blocking.

### Relevance to cli-rts
This is directly relevant. Our game state engine and daemon should use async hooks
for non-blocking event capture. The `additionalContext` injection on next turn
could be used to feed game state summaries back into Claude's context.

Key consideration: async hooks cannot block or modify the current action -- only
provide context for future turns. For game events that need immediate processing,
synchronous hooks are required but must stay fast.

---

## 5. Testing Patterns

The project validates 11 of 13 hooks via automated testing. From available information:

- Tests pipe synthetic JSON payloads to hook scripts via stdin to simulate Claude Code.
- Each hook script is tested independently as a standalone process.
- The test harness verifies: exit codes, stdout JSON structure, log file output,
  and side effects (file creation, etc.).
- The 2 untested hooks are likely lifecycle events that are difficult to simulate
  outside a live Claude Code session (e.g., Notification, SubagentStop).

### Relevance to cli-rts
This stdin-piping approach is exactly what we should use. Since hooks are just
processes that read JSON from stdin and write to stdout, they are straightforward
to test without needing Claude Code running. We should build a test harness that:
1. Constructs sample payloads per event type
2. Invokes the hook script as a subprocess
3. Asserts on exit code, stdout JSON, and side effects (game state changes)

---

## 6. Pitfalls and Edge Cases

### Infinite Loop with Stop Hooks
If a Stop hook always returns "continue working," Claude enters an infinite loop.
**Fix**: Check the `stop_hook_active` field in the input JSON and exit early (exit 0)
if it is `true`. This field indicates the hook has already triggered a continuation.

```python
input_data = json.load(sys.stdin)
if input_data.get("stop_hook_active"):
    sys.exit(0)  # Allow Claude to actually stop
```

### Shell Profile Pollution
When Claude Code spawns a hook process, it sources your shell profile (~/.zshrc,
~/.bashrc). If the profile contains unconditional `echo` statements, that output
gets prepended to the hook's JSON stdout, causing parse errors.
**Fix**: Guard echo statements in shell profiles with an interactive-shell check:
```bash
if [[ $- == *i* ]]; then
    echo "Welcome!"
fi
```

### Settings Pollution in Subagents
Subagents inherit the parent's hook settings. If hooks have side effects
(file writes, network calls), they fire for every subagent invocation too.
**Fix**: Use `$CLAUDE_PROJECT_DIR` and check environment variables to detect
subagent context. Design hooks to be idempotent.

### Hook Timeout
Synchronous hooks that take too long will be killed. Keep synchronous hook logic
fast (< 1-2 seconds). Offload heavy work to async hooks or background processes.

### JSON Output Capture Bug
There have been reported issues (anthropics/claude-code#10875) where plugin hooks'
JSON output is not captured correctly. Ensure clean stdout with no extra output
before/after the JSON object.

### Relevance to cli-rts
All of these apply directly:
- Our game daemon must handle the stop_hook_active guard.
- Shell profile pollution could corrupt our JSON event stream.
- Subagent settings pollution is critical since our project already involves
  multi-agent patterns. Hooks must be idempotent.
- Our synchronous hooks must stay fast; heavy game state computation should
  happen in the daemon process, not inline in the hook.
- We must ensure clean stdout in hook scripts -- no debug prints, no stray output.

---

## Summary of Key Takeaways for cli-rts

| Pattern | Adoption Priority | Notes |
|---------|------------------|-------|
| One script per event type | Already doing | Validate our structure matches |
| JSONL logging with full payloads | High | Add raw payload logging alongside game events |
| Exit code protocol (0/2) | Already doing | Ensure all hooks respect this |
| JSON stdout responses | Medium | Use for injecting game context |
| Async hooks for non-blocking work | High | Use for game state updates |
| stdin-piping test harness | High | Build this for our hook scripts |
| stop_hook_active guard | High | Must implement to avoid infinite loops |
| Shell profile pollution guard | Medium | Document for users |
| Idempotent hooks for subagents | High | Critical for multi-agent scenarios |
| $CLAUDE_PROJECT_DIR paths | Already doing | Verify consistency |

---

## Sources

- [GitHub: disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- [YUV.AI Blog: Claude Code Hooks Mastery](https://yuv.ai/blog/claude-code-hooks-mastery)
- [Claude Code Hooks Reference (Official)](https://code.claude.com/docs/en/hooks)
- [Claude Code Hooks Guide (Official)](https://code.claude.com/docs/en/hooks-guide)
- [DataCamp: Claude Code Hooks Practical Guide](https://www.datacamp.com/tutorial/claude-code-hooks)
- [Steve Kinney: Hook Control Flow](https://stevekinney.com/courses/ai-development/claude-code-hook-control-flow)
- [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)
