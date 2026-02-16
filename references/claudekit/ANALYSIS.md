# claudekit Analysis (carlrannaberg/claudekit)

Research date: 2026-02-15
Relevance: Hook-based tooling for Claude Code; patterns applicable to cli-rts game state engine.

---

## 1. Custom Bash Test Framework

claudekit ships a hand-rolled shell test framework in `tests/test-framework.sh` (~280 lines).

**Assertions provided:**
- `assert_equals`, `assert_not_equals` -- string comparison with message
- `assert_contains`, `assert_not_contains` -- substring search
- `assert_exit_code` -- thin wrapper on assert_equals
- `assert_file_exists`, `assert_file_not_exists`, `assert_file_contains` -- filesystem checks
- `assert_pass`, `assert_fail` -- explicit pass/fail markers

**Test lifecycle:**
- `init_test(name)` creates a temp directory via `mktemp -d`, cds into it, saves `$PATH`.
- `cleanup_test()` runs registered cleanup functions, restores PATH, deletes temp dir.
- Tests run in subshells for isolation (`(set -e; $test_function)`).

**Auto-discovery:** `discover_tests` greps for `test_*()` function signatures in a file.
`run_test_suite` also supports `setUp` / `tearDown` lifecycle hooks.

**Mocking:** `create_mock_command` writes a bash script to `$PWD`, chmods +x, prepends
to PATH. `create_mock_git` is a pre-built scenario mock (clean, uncommitted, no-repo)
with case-based routing for git subcommands.

**Reporting:** `test-reporter.sh` counts checkmark/cross characters from captured output.
The runner pipes itself through `tee` to a tempfile, then post-processes for summary counts.

**cli-rts takeaway:** This is lightweight but effective. Our Bash hooks could reuse
the same pattern: temp-dir isolation, PATH-based command mocking, and function-name
auto-discovery. The mock-git pattern is directly useful for testing our daemon's
interaction with git state.

---

## 2. Hook Profiling System

File: `cli/hooks/profile.ts` (~300 lines)

**Approach:** Profiles hooks by actually executing them as child processes via
`execSync('echo $PAYLOAD | claudekit-hooks run $HOOK 2>&1')` and measuring wall-clock time.

**What it measures:**
- Execution time (ms)
- Output character count
- Estimated token count (chars / 4)

**Multi-iteration support:** Runs N iterations and averages results.

**Thresholds (from `constants.ts`):**
- SLOW_EXECUTION_MS: 5000ms -- red warning
- SAFE_OUTPUT_CHARS: 9000 -- yellow warning (risk of Claude Code truncation)
- MAX_OUTPUT_CHARS: 10000 -- red warning (WILL be truncated by Claude Code)

**Test payload generation:** The profiler generates realistic test payloads per hook type.
For example, `file-guard` gets a sensitive file path, `check-comment-replacement` gets an
Edit payload, transcript-dependent hooks get temporary JSONL transcript files.

**cli-rts takeaway:** The 10k character output limit for UserPromptSubmit hooks is a hard
constraint we must respect. The profiling-by-subprocess approach is sound -- we should build
similar instrumentation for our daemon's emit latency. The per-hook-type payload generation
pattern is useful for our test harness.

---

## 3. TypeScript Compilation to Binary

File: `build.config.ts`

**Tool:** esbuild (not tsc for bundling).

**Strategy:** Three separate esbuild entry points compiled to ESM:
1. `cli/cli.ts` -> `dist/cli.js` (main CLI)
2. `cli/hooks-cli.ts` -> `dist/hooks-cli.js` (hooks runner)
3. `cli/index.ts` -> `dist/index.js` (library exports)

**Key config:**
- `platform: 'node'`, `target: 'node20'`, `format: 'esm'`
- `packages: 'external'` -- dependencies NOT bundled (requires npm install)
- `external: ['node:*']` -- Node built-ins excluded
- Sourcemaps enabled; minification only in production

**Distribution:** Two bin entries in package.json (`claudekit`, `claudekit-hooks`),
installed globally via `npm install -g claudekit`.

**Not a true single binary.** It compiles TS to JS bundles but still requires Node.js
runtime and npm-installed dependencies. This is NOT like Go/Rust single-binary compilation.

**cli-rts takeaway:** If we want a true single binary (no Node runtime dependency), esbuild
alone is insufficient. We would need `pkg`, `bun build --compile`, or `deno compile`. For
our use case (hooks must be fast-starting), the esbuild approach is fine as long as Node is
available. The three-entrypoint pattern (CLI, hooks runner, library) is a good separation.

---

## 4. Architecture for Multiple Hook Event Types

**Base class pattern:** `cli/hooks/base.ts` defines `abstract class BaseHook` with:
- Abstract `name` property and `execute(context)` method
- Concrete `run(payload)` that handles: infinite loop prevention, session disable checks,
  subagent detection, project root discovery, package manager detection
- Utility methods: `execCommand`, `fileExists`, `readFile`, `shouldSkipFile`, `progress`,
  `success`, `warning`, `error`, `jsonOutput`

**Hook metadata:** Each hook class has static `metadata: HookMetadata` with:
- `triggerEvent`: `PostToolUse | PreToolUse | Stop | SubagentStop | SessionStart | UserPromptSubmit`
- `matcher`: tool patterns (e.g., `"Write|Edit|MultiEdit"`)
- `category`: validation, testing, git, project-management, utility

**Registry:** `registry.ts` auto-discovers hooks by iterating `Object.entries(Hooks)`,
filtering exports ending with `Hook` that are constructors. No manual registration needed.

**Runner:** `runner.ts` loads config, reads stdin JSON payload, instantiates the right hook
class, runs it, logs execution stats, and outputs JSON response.

**Event routing:** The `.claude/settings.json` maps event types to hook commands:
```
hooks.PostToolUse[].hooks[].command = "claudekit-hooks run typecheck-changed"
hooks.Stop[].hooks[].command = "claudekit-hooks run check-todos"
```
Each invocation is a separate process. Claude Code does the event routing; claudekit
just handles the `run <hook-name>` dispatch.

**cli-rts takeaway:** This is a one-hook-per-process model. Each Claude Code event spawns
a new `claudekit-hooks run X` process. For cli-rts, where we need persistent game state,
a daemon model is better. But the base-class pattern (common lifecycle in `run()`, custom
logic in `execute()`) and auto-discovery registry are directly applicable to our hook
handler architecture.

---

## 5. Hook-to-Server Communication

claudekit does NOT use a persistent server/daemon. Each hook is a standalone process that:

1. Reads JSON payload from **stdin** (Claude Code pipes event data)
2. Does its work (runs tsc, eslint, reads transcripts, etc.)
3. Outputs JSON to **stdout** (Claude Code reads the response)
4. Logs execution data to **~/.claudekit/logs/hook-executions.jsonl**
5. Updates aggregate stats in **~/.claudekit/logs/hook-stats.json**

**Session state persistence:** Uses filesystem-based session state:
- `~/.claudekit/sessions/{transcript-uuid}.json` tracks disabled hooks per session
- Atomic writes via temp file + rename pattern
- UUID extracted from Claude Code's transcript path

**cli-rts takeaway:** Our daemon architecture is fundamentally different (persistent process
with game state in memory). But the patterns we should adopt:
- Atomic file writes (write temp, rename) for any disk-persisted state
- JSONL append-only log for execution history
- Transcript UUID as session identifier
- The stdin/stdout JSON protocol is the only interface Claude Code supports

---

## 6. Edge Cases and Pitfalls Handled

**Infinite loop prevention:** `BaseHook.run()` checks `payload.stop_hook_active === true`
and exits immediately. This prevents hooks from triggering themselves recursively.

**Subagent awareness:** Hooks check `hook_event_name === 'SubagentStop'` and can opt out
of running in subagent contexts via `isHookDisabledForSubagent()`.

**stdin hanging:** `readStdin()` is TTY-aware with timeout handling to prevent the process
from blocking forever when run interactively (outside Claude Code).

**Output size limits:** Claude Code truncates UserPromptSubmit hook output at 10k chars.
The profiler warns about this; hooks must be conscious of output size.

**Process cleanup:** Uses `setImmediate(() => process.exit(exitCode))` to allow final I/O
to flush before exiting. The runner also captures output with a 10MB memory limit.

**Session cleanup:** `SessionTracker.cleanOldSessions()` deletes session files older than
7 days to prevent unbounded disk growth.

**Fuzzy hook name matching:** The CLI resolves partial hook names with fallback logic:
exact match -> partial match -> registry check -> suggestions.

**cli-rts takeaway:** Critical patterns for us:
- Infinite loop guard (our hooks write state that could trigger more hooks)
- stdin timeout (our daemon must handle malformed or missing input gracefully)
- Output size cap (we MUST keep hook responses under 10k chars)
- Session file cleanup (our game state files need TTL/rotation)
- The setImmediate exit pattern for clean Node.js process shutdown

---

## Summary of Key Patterns for cli-rts

| Pattern | claudekit Approach | cli-rts Adaptation |
|---------|-------------------|-------------------|
| Hook dispatch | One process per event | Thin shim -> daemon (persistent) |
| State persistence | Filesystem JSON per session | In-memory game state + periodic flush |
| Test framework | Custom Bash with PATH mocking | Reuse their assertion/mock patterns |
| Build | esbuild ESM bundles | Consider bun compile for true single binary |
| Profiling | Subprocess timing + char counting | Adapt for daemon latency measurement |
| Output limits | 10k char hard cap awareness | Must enforce in all hook responses |
| Loop prevention | stop_hook_active flag check | Essential for our emit->hook cycle |
| Session identity | Transcript UUID extraction | Use same UUID for game session binding |
