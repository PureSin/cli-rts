# Analysis: karanb192/claude-code-hooks

Repository: https://github.com/karanb192/claude-code-hooks (143 stars)
Author blog post: https://karanbansal.in/blog/claude-code-hooks/
Reviewed: 2026-02-15

## What It Is

A curated, copy-paste collection of Claude Code hooks covering safety, automation,
and notifications. Ships with a Node.js test runner and per-hook unit tests.
Zero external dependencies -- uses Node.js built-in `node:test` module.

---

## 1. Per-Event-Type Test Organization

Tests mirror the hook directory structure under `hook-scripts/tests/`:

```
hook-scripts/
  pre-tool-use/
    block-dangerous-commands.js
    protect-secrets.js
  post-tool-use/
    auto-stage.js
  notification/
    notify-permission.js
  utils/
    event-logger.py
  tests/
    pre-tool-use/
      block-dangerous-commands.test.js
      protect-secrets.test.js
    post-tool-use/
      auto-stage.test.js
    ...
```

Key pattern: tests live in a parallel `tests/` tree organized by event type
(`pre-tool-use/`, `post-tool-use/`, `notification/`). Each hook gets its own
`.test.js` file. This makes it trivial to run a single hook's tests:

```bash
node --test hook-scripts/tests/pre-tool-use/block-dangerous-commands.test.js
```

**Relevance to cli-rts:** Our daemon handles multiple event types (PreToolUse,
PostToolUse, Stop, Notification). Mirroring this directory convention would keep
game-state tests cleanly separated by the event that triggers them.

---

## 2. Safety-Level Tiering

The `block-dangerous-commands.js` hook defines a `SAFETY_LEVEL` constant at the
top of the file with three tiers:

| Level      | What It Blocks                                        |
|------------|-------------------------------------------------------|
| `critical` | Catastrophic only: `rm -rf ~`, `rm -rf /`, fork bombs |
| `high`     | Adds risky ops: `git push --force` to main, `git reset --hard` |
| `strict`   | Adds cautionary: any force push, `sudo rm`, `docker prune` |

Implementation approach:
- Each tier is an array of regex patterns.
- Higher tiers are supersets (strict includes high includes critical).
- The active tier is selected by a single constant: `const SAFETY_LEVEL = 'strict'`.
- Users customize by editing one line; no config file indirection.

**Relevance to cli-rts:** We could tier our hook responses similarly. For example,
a "passive" mode that only logs game events vs. an "active" mode that blocks
certain tool uses when game conditions aren't met. The flat-constant approach
is simpler than a config file for single-hook behavior.

---

## 3. Node.js Test Runner Approach

- Uses Node.js built-in `node:test` (no Jest, Mocha, or Vitest).
- `package.json` scripts: `"test": "node --test hook-scripts/tests/**/*.test.js"`
- Zero test dependencies -- entire repo has no `node_modules` at runtime.
- Tests use `node:assert` for assertions.
- Test structure uses `describe()` / `it()` from `node:test`.

Benefits observed:
- Startup is instant (no framework boot).
- Tests can import hook functions directly (hooks export their logic).
- Each hook file exports both its main stdin handler AND individual check
  functions, enabling unit tests without simulating stdin.

**Relevance to cli-rts:** We already use Node.js. Adopting `node:test` for hook
logic tests would keep us dependency-light and fast. Our game engine functions
should similarly be exported and testable independent of stdin plumbing.

---

## 4. JSON stdin Parsing and Error Handling

Hooks receive event data as a single JSON blob on stdin. The standard pattern:

```js
// Collect all stdin data
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    // ... hook logic using event.tool_name, event.tool_input, etc.
  } catch (err) {
    // Exit 0 on parse failure -- never crash Claude Code
    process.exit(0);
  }
});
```

Key patterns and edge cases handled:
- **Empty stdin**: Treated as no-op, exit 0.
- **Malformed JSON**: Caught, logged, exit 0 (fail-open, not fail-closed).
- **Missing fields**: Defensive checks on `event.tool_input`, `event.tool_name`
  before accessing nested properties.
- **Output protocol**: Exit 0 + JSON stdout = instruct Claude Code.
  Exit 0 + no stdout = allow. Non-zero exit = hook error (Claude Code logs it).

The `event-logger.py` utility (Python) follows the same pattern with
`json.load(sys.stdin)` and writes timestamped payloads to a log file for
debugging. This is a recommended first step before writing any new hook.

**Relevance to cli-rts:** Our `emit` command already parses stdin JSON. We should
adopt the same fail-open pattern: never let a parse error block Claude Code.
The event-logger pattern is directly useful for debugging our game state updates.

---

## 5. Hook Configuration and Registration

Hooks are registered in `.claude/settings.json` (project) or
`~/.claude/settings.json` (global). Structure:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/block-dangerous-commands.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/auto-stage.js"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/notify-permission.js"
          }
        ]
      }
    ]
  }
}
```

Key design decisions:
- **Matcher is a regex string** against tool name (or `"*"` / omit for all).
- **Multiple hooks per event** are supported (array of matcher groups).
- **Pipe-delimited matchers** for matching multiple tools: `"Edit|MultiEdit|Write"`.
- **Three config scopes**: project `.claude/settings.json`, user
  `~/.claude/settings.json`, local `.claude/settings.local.json` (gitignored).
- Hooks are plain shell commands -- no plugin system, no runtime, no SDK.

**Relevance to cli-rts:** Our `init` command generates this config. We should
support the multi-matcher pattern (pipe-delimited) and consider providing both
project-level and user-level config templates.

---

## 6. Edge Cases and Pitfalls

1. **Fail-open vs fail-closed**: All hooks exit 0 on errors. A crashing hook
   should never block the developer. This is a deliberate design choice.

2. **No async/await at top level**: Stdin parsing is callback-based (`on('data')`,
   `on('end')`). This avoids issues with Node.js top-level await in scripts
   invoked by Claude Code.

3. **Hook output format matters**: Only JSON printed to stdout on exit 0 is
   parsed by Claude Code. Stray `console.log()` calls will corrupt the protocol.
   Hooks use `console.error()` for debug logging.

4. **Matcher specificity**: Overly broad matchers (e.g., `"*"` on PreToolUse)
   fire on every tool call and add latency. The repo recommends specific matchers.

5. **No persistent state between hook invocations**: Each hook runs as a fresh
   process. The repo does not address stateful hooks (this is exactly where
   cli-rts adds value with its daemon).

6. **Python vs Node.js hooks**: The event-logger is Python, other hooks are JS.
   Claude Code does not care about language -- it just runs the command. But the
   repo standardizes on Node.js for testability.

7. **Testing stdin simulation**: Tests import hook logic functions directly
   rather than spawning child processes and piping stdin. This is faster and
   more reliable but means integration-level stdin tests are separate.

---

## Summary of Patterns to Adopt in cli-rts

| Pattern | How to Apply |
|---------|-------------|
| Test tree mirrors hook event types | `tests/pre-tool-use/`, `tests/post-tool-use/`, etc. |
| `node:test` + `node:assert` | Zero-dep testing, already compatible with our stack |
| Export logic functions separately from stdin handler | Enables unit tests without stdin simulation |
| Fail-open on all errors | Never block Claude Code; log and exit 0 |
| `console.error()` for debug, stdout reserved for protocol | Prevent protocol corruption |
| Safety-level constant | Configurable game difficulty or hook aggressiveness |
| Event-logger utility | Ship a debug/inspect mode for game state events |
| Stateless hooks (their limitation) | Our daemon solves this; document the contrast |

## Key Difference from cli-rts

The biggest gap in karanb192/claude-code-hooks is **statefulness**. Every hook
invocation is a fresh process with no memory. Our daemon architecture directly
addresses this by maintaining persistent game state across hook events. This is
the core value proposition of cli-rts over a stateless hook collection.
