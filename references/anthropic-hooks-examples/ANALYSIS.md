# Anthropic Claude Code Hooks -- Official Examples Analysis

Research date: 2026-02-15
Sources: `anthropics/claude-code` repo (`examples/hooks/`, `plugins/hookify/`), official docs at code.claude.com

## 1. Canonical Guard/Validator Pattern

The official `bash_command_validator_example.py` establishes the reference pattern:

```
1. Read JSON from stdin           -- json.load(sys.stdin)
2. Extract tool_name, tool_input  -- input_data.get("tool_name", "")
3. Short-circuit if irrelevant    -- sys.exit(0) early
4. Run validation logic           -- regex rules, checks, etc.
5. Signal result via exit code    -- exit(0)=pass, exit(2)=block
```

Key design choices:
- **Single responsibility**: one script per concern (validator, logger, etc.)
- **Fail-open by default**: any exception or irrelevant tool -> `sys.exit(0)`
- **No stdout on pass**: only write to stderr or stdout when you need to communicate
- **Matcher in config, not in script**: the `hooks.json` `matcher` field filters by tool name before the script even runs, but the script double-checks `tool_name` defensively

The `hookify` plugin (official, in `plugins/hookify/`) shows the scaled-up version: a rule engine that loads markdown config files, evaluates conditions, and returns structured JSON. Even at this complexity level, every hook script wraps everything in try/except and **always exits 0** -- it never uses exit(2) directly, preferring the JSON output approach for blocking.

## 2. Parsing stdin JSON Payloads

All official examples use the same pattern:

```python
input_data = json.load(sys.stdin)
```

Common fields present in every event:
- `session_id` -- unique session identifier
- `cwd` -- working directory
- `hook_event_name` -- e.g. "PreToolUse", "PostToolUse", "Stop"
- `transcript_path` -- path to the JSONL transcript file
- `permission_mode` -- e.g. "default"

Event-specific fields:
- **PreToolUse**: `tool_name`, `tool_input` (object), `tool_use_id`
- **PostToolUse**: `tool_name`, `tool_input`, `tool_use_id`, `tool_response`
- **PostToolUseFailure**: above + `error`, `is_interrupt`
- **Stop/SubagentStop**: `stop_hook_active`, `reason`
- **SubagentStart/SubagentStop**: `agent_id`, `agent_type`, `agent_transcript_path`
- **SessionStart**: `source`, `agent_type`
- **SessionEnd**: `reason`
- **Notification**: `message`, `title` (optional), `notification_type`
- **UserPromptSubmit**: `user_prompt`
- **PreCompact**: `custom_instructions`
- **PermissionRequest**: `tool_name`, `permission_suggestions`

The official example handles `JSONDecodeError` explicitly and exits 1 on bad input.

## 3. Exit Code Conventions

| Code | Meaning | stderr | stdout |
|------|---------|--------|--------|
| 0 | Success/allow | ignored | parsed as JSON if present |
| 1 | Non-blocking error | shown to user (not Claude) | ignored |
| 2 | Block the action | sent to Claude as feedback | ignored |
| other | Non-blocking error | shown in verbose mode | ignored |

Critical rule: **exit(2) and JSON stdout are mutually exclusive**. Claude Code only parses JSON from stdout on exit(0). If you exit(2), any stdout JSON is ignored; stderr becomes the message.

The official example uses exit(2) + stderr for the simple validator. The hookify plugin uses exit(0) + JSON stdout for everything, even blocking. The JSON approach is more flexible.

## 4. JSON stdout Output Format (SyncHookJSONOutput)

When exiting 0, you can print a JSON object to stdout with these fields:

```json
{
  "decision": "approve" | "block",
  "reason": "string shown to Claude",
  "systemMessage": "injected into Claude's context",
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "why"
  }
}
```

The hookify rule engine demonstrates the pattern for different events:
- **PreToolUse blocking**: `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny"}, "systemMessage": "..."}`
- **Stop blocking**: `{"decision": "block", "reason": "...", "systemMessage": "..."}`
- **Warning (non-blocking)**: `{"systemMessage": "warning text"}` (no decision field)
- **No match**: `{}` (empty object)

## 5. Async vs Sync Hooks

Configuration-level setting:

```json
{
  "type": "command",
  "command": "python3 /path/to/hook.py",
  "timeout": 10,
  "async": true
}
```

- **Sync (default)**: blocks Claude until hook completes. Can return decisions (allow/deny/block). Default timeout 30s.
- **Async** (`"async": true`): runs in background, cannot block or control Claude. `decision`, `permissionDecision`, `continue` fields have no effect. Good for logging/telemetry.
- The hookify plugin uses `"timeout": 10` on all hooks (sync, 10s limit).

**cli-rts relevance**: Our project correctly uses `"async": true` for all hooks since we are doing observability/game-state logging, not gating. This matches the official guidance: async hooks are for fire-and-forget side effects.

## 6. Best Practices and Gotchas

From the official examples and patterns:

1. **Always fail open**: Every hookify script has `finally: sys.exit(0)`. Never let an exception in your hook block Claude. The bash_command_validator wraps main in try/except too.

2. **Timeout awareness**: Hooks have a configurable timeout (default 30s). If your hook does I/O (HTTP, file reads), keep it fast or use async mode. The hookify plugin sets 10s timeouts.

3. **Matcher is your first filter**: Use the `matcher` field in hooks.json to limit which tool names trigger your script. This avoids running Python for every single tool call.

4. **stderr semantics depend on exit code**: exit(1) shows stderr to user. exit(2) shows stderr to Claude. This is a subtle but important distinction.

5. **JSON must be the only stdout content**: If using the JSON output approach, your script's stdout must contain only the JSON object. Any print() calls before the JSON will corrupt parsing.

6. **Plugin environment**: Hookify uses `CLAUDE_PLUGIN_ROOT` env var for path resolution. The `${CLAUDE_PLUGIN_ROOT}` variable is expanded in hooks.json command strings.

7. **No matcher = matches everything**: In hookify's hooks.json, hooks are registered without a `matcher` field, meaning they fire for all tools of that event type. Filtering happens inside the Python script via the rule engine.

8. **Config-level hook blocking**: Enterprise settings can set `allowManagedHooksOnly: true` to prevent user/project hooks from running. This is relevant for understanding the trust model.

## 7. Observations for cli-rts

**What we are doing right:**
- All hooks are async (correct for observability/game-state)
- We read JSON from stdin in our emit commands
- We exit 0 on all paths (fail-open)

**Potential gaps to investigate:**
- We are missing `matcher` fields -- every hook fires for every tool. For PreToolUse/PostToolUse, adding a matcher could reduce unnecessary process spawns if we only care about certain tools.
- We do not set `timeout` on our hooks. The default is 30s, which is generous for async fire-and-forget, but being explicit is better practice.
- The official hooks.json does not use custom fields like `__cli_rts`. This is currently harmless (unknown fields are ignored), but it is non-standard and could break if Claude Code starts validating hook config schemas strictly.
- We register 13 hook events but the official hookify plugin only uses 4 (PreToolUse, PostToolUse, Stop, UserPromptSubmit). The full set of 13 events is valid, but we should confirm all events actually fire in current Claude Code versions.
- Our hooks spawn a full Node.js process (`node dist/cli.js emit ...`) per event. The official examples use lightweight Python scripts. For high-frequency events like PreToolUse (fires for every tool call), process spawn overhead could add up. Consider whether a long-running daemon with IPC would be more efficient than per-event process spawning.

## 8. Full Hook Event List (13 events)

From official docs: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubagentStart, SubagentStop, Stop, PreCompact, TaskCompleted.

Our settings.json registers all 13. This is complete coverage.
