#!/usr/bin/env bash
# cli-rts SessionStart hook
# Ensures capture daemon and render server are running, opens browser tabs,
# then forwards the session-start event payload to the daemon.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_RTS_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"  # bin/ -> capture/ -> cli-rts/
CAPTURE_JS="$CLI_RTS_ROOT/capture/dist/cli.js"
RENDER_DIR="$CLI_RTS_ROOT/render"

STARTED=false

# 1. Start capture daemon if not already running on port 4175
if ! lsof -ti:4175 > /dev/null 2>&1; then
  (cd "$CLI_RTS_ROOT" && node "$CAPTURE_JS" start > /dev/null 2>&1) &
  STARTED=true
fi

# 2. Start render server if not already running on port 5175
if ! lsof -ti:5175 > /dev/null 2>&1; then
  (cd "$RENDER_DIR" && npm run dev > /dev/null 2>&1) &
  STARTED=true
fi

# Give freshly-started servers a moment to bind
if [ "$STARTED" = true ]; then
  sleep 2
fi

# 3. Open browser tabs
if command -v open > /dev/null 2>&1; then
  # macOS
  open "http://localhost:5175" 2>/dev/null
  open "http://127.0.0.1:4175/state" 2>/dev/null
elif command -v xdg-open > /dev/null 2>&1; then
  # Linux
  xdg-open "http://localhost:5175" 2>/dev/null
  xdg-open "http://127.0.0.1:4175/state" 2>/dev/null
fi

# 4. Forward the session-start event payload (stdin from hook) to the daemon
node "$CAPTURE_JS" emit session-start
