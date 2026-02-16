# tdd-guard Analysis

Research notes on [nizos/tdd-guard](https://github.com/nizos/tdd-guard), a TDD enforcement
tool built on Claude Code hooks. Findings relevant to cli-rts.

## What tdd-guard Does

Enforces red-green-refactor TDD discipline on Claude Code agents. When the agent
tries to write implementation without a failing test, over-implement beyond test
requirements, or add multiple tests at once, tdd-guard **blocks the tool call**
and returns corrective guidance injected as a `<system-reminder>` tag.

## 1. Cross-Framework Reporter Pattern

### Architecture

tdd-guard uses **language-specific reporter packages** that plug into each test
runner's native reporter API:

- `tdd-guard-vitest` (npm) -- Vitest reporter
- `tdd-guard-jest` (npm) -- Jest reporter
- `tdd-guard-rust` (crates.io) -- cargo test / cargo-nextest reporter
- Python (PyPI) -- pytest plugin
- PHPUnit, Go 1.24+ also supported

### How it works

Each reporter is a **pass-through filter**: it forwards all test output to stdout
unchanged (so the developer sees normal output) while simultaneously writing
structured results to a shared data file:

```
.claude/tdd-guard/data/test.json
```

Example Vitest config:

```typescript
import { VitestReporter } from 'tdd-guard-vitest'
export default defineConfig({
  test: {
    reporters: ['default', new VitestReporter(path.resolve(__dirname))],
  },
})
```

### Relevance to cli-rts

This pattern -- framework-specific adapters writing to a single shared JSON file
consumed by a framework-agnostic hook binary -- is directly applicable. For
cli-rts, game event producers (hooks on different event types) could write to a
shared state file consumed by the daemon/engine. The reporter pattern proves
that decoupling producers from consumers via a file-based contract works well
in the Claude Code hook ecosystem.

## 2. Hook Binary Structure: Handling Multiple Event Types

### Three hook registration points

tdd-guard registers as a single `tdd-guard` command across three Claude Code
hook events:

| Hook Event          | Matcher                          | Purpose                        |
|---------------------|----------------------------------|--------------------------------|
| `PreToolUse`        | `Write\|Edit\|MultiEdit\|TodoWrite` | Block TDD violations           |
| `UserPromptSubmit`  | (none / catch-all)               | Quick commands (on/off toggle) |
| `SessionStart`      | `startup\|resume\|clear`         | Session initialization         |

### Single binary, multiple behaviors

The same `tdd-guard` binary handles all event types. It reads the hook event
type from stdin (Claude Code passes JSON with tool name, input, etc.) and
dispatches internally. This avoids maintaining separate scripts per hook.

### Validation logic

For PreToolUse, the binary aggregates three data sources:
1. **File modifications** -- the proposed Write/Edit/MultiEdit content from stdin
2. **Todo state** -- the agent's current todo list
3. **Test results** -- from `.claude/tdd-guard/data/test.json`

It then spawns a **separate Claude Code session** (or calls the Anthropic API
directly) to evaluate whether the proposed change adheres to TDD principles.
Dynamic prompt templates are used per tool type since Write (full file), Edit
(targeted patch), and MultiEdit (multiple patches) have different semantics.

### Relevance to cli-rts

The single-binary-multi-event pattern is a strong model for cli-rts. Our hook
binary could similarly dispatch on event type internally rather than maintaining
separate scripts. The aggregation of stdin event data + persisted state files
is the same pattern we need for combining hook events with game state.

## 3. State Persistence Between Hook Invocations

### File-based persistence

Since each hook invocation runs as a **separate process**, tdd-guard persists
all shared state to the filesystem under `.claude/tdd-guard/data/`:

- `test.json` -- latest test results (written by reporters)
- Session state -- toggle on/off, current TDD phase
- Stored lint/quality issues -- from PostToolUse hooks

### Cross-phase state transfer

A key pattern: PostToolUse hooks (observing) capture lint/quality issues and
**store them to files**. The next PreToolUse hook (blocking) then reads those
stored issues and mandates their resolution before allowing new changes.

This solves the problem that PostToolUse hooks are "weakly enforced" (the agent
can ignore advisory feedback). By persisting issues and checking them in the
blocking PreToolUse phase, enforcement is deferred but guaranteed.

### Relevance to cli-rts

This is directly applicable to our game state engine. Game events from
PostToolUse (observing) can accumulate state that influences PreToolUse
(blocking) decisions. The file-based persistence under `.claude/` is the
proven convention. We should follow `.claude/cli-rts/` for our state files.

## 4. Blocking vs Observing Enforcement

### Blocking (PreToolUse)

- Hook exits with non-zero code OR returns JSON with a `decision: "block"` field
- Claude Code prevents the tool call from executing
- The `additionalContext` field in the JSON response is injected as a
  `<system-reminder>` into the agent's context, guiding corrective behavior
- Used for: preventing implementation without failing tests

### Observing (PostToolUse, SessionStart, UserPromptSubmit)

- Hook exits 0 with optional `additionalContext`
- The agent receives guidance but is not blocked
- Used for: capturing lint issues, session management, toggle commands

### The "store-then-block" escalation pattern

Post-action hooks store issues. Pre-action hooks block if unresolved issues
exist. This gives the agent one chance to self-correct before hard blocking.

### Relevance to cli-rts

For game state, most hooks should observe and accumulate state (resource
collection, unit movement). Blocking should be reserved for rule violations
(e.g., spending resources the player does not have). The store-then-block
pattern could enforce game rules across turns.

## 5. Build and Distribution

### Written in TypeScript (Node.js)

The core `tdd-guard` CLI is a TypeScript/Node.js package.

### Multi-channel distribution

| Channel   | Package                |
|-----------|------------------------|
| Homebrew  | `brew install tdd-guard` |
| npm       | `tdd-guard` (core), `tdd-guard-vitest`, `tdd-guard-jest` |
| PyPI      | `tdd-guard` (Python reporter) |
| crates.io | `tdd-guard-rust`       |

Homebrew provides binary bottles (pre-compiled for platforms), avoiding the
Node.js dependency for end users.

### Relevance to cli-rts

The multi-package approach (core CLI + per-framework reporters) is worth
considering if cli-rts needs framework-specific integrations. Homebrew
distribution via bottles is the gold standard for CLI tools on macOS.

## 6. Edge Cases and Pitfalls

### False positives from LLM-based validation

tdd-guard uses an LLM call to evaluate TDD compliance. This introduces
subjectivity: some models include verbose explanations that trip the parser,
and refactoring scenarios are ambiguous (e.g., an Edit that touches three
tests but only adds one new one while refactoring two existing ones).

### Stale test data

If the reporter has not run recently, `test.json` contains stale results.
The hook may block valid changes or allow invalid ones based on outdated data.
No built-in staleness detection was found.

### Missing Claude binary (Issue #14)

The hook spawns a Claude subprocess for validation. If the Claude binary path
is wrong (`ENOENT` error), the hook blocks ALL edits with no explanation.
Lesson: always handle subprocess spawn failures gracefully with clear errors.

### Tool-specific prompt misalignment

Write, Edit, and MultiEdit have different semantics. Early versions used a
single validation prompt for all three, causing confusing false positives.
The fix was dynamic per-tool-type prompt templates.

### Performance overhead

Every Write/Edit/MultiEdit triggers an LLM call for validation, introducing
latency. For cli-rts, we should ensure hook handlers are fast (no LLM calls;
pure state machine logic).

### PostToolUse hooks can be ignored

The agent can choose to disregard advisory context from PostToolUse hooks.
The store-then-block pattern is the workaround.

## Key Takeaways for cli-rts

1. **Single binary, multi-event dispatch** -- one hook command handling all
   event types via internal routing based on stdin JSON.
2. **File-based state under `.claude/`** -- proven convention for persisting
   state between hook invocations (separate processes).
3. **Reporter/adapter pattern** -- framework-specific producers writing to a
   shared data file consumed by a framework-agnostic core.
4. **Store-then-block escalation** -- observe in PostToolUse, enforce in
   PreToolUse, using persisted state as the bridge.
5. **Keep hook handlers fast** -- tdd-guard's LLM-call-per-hook approach adds
   latency; cli-rts should use deterministic state machine logic instead.
6. **Handle errors loudly** -- subprocess failures and stale data must produce
   clear diagnostics, not silent blocking.

## Sources

- [nizos/tdd-guard GitHub](https://github.com/nizos/tdd-guard)
- [TDD Guard for Claude Code - Nizar's Blog](https://nizar.se/tdd-guard-for-claude-code/)
- [tdd-guard - ClaudeLog](https://claudelog.com/claude-code-mcps/tdd-guard/)
- [tdd-guard - Homebrew](https://formulae.brew.sh/formula/tdd-guard)
- [tdd-guard Issue #14](https://github.com/nizos/tdd-guard/issues/14)
- [Agentic TDD - Nizar's Blog](https://nizar.se/agentic-tdd/)
