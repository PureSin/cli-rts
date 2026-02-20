#!/bin/bash
set -euo pipefail

# setup.sh - Install cli-rts and optionally peon-ping for sound

INSTALL_SOUND=false
PEON_REPO="https://github.com/PeonPing/peon-ping.git"
PEON_TMP_DIR="/tmp/peon-ping-install-$(date +%s)"

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --sound|-s)
      INSTALL_SOUND=true
      ;;
    --help|-h)
      echo "Usage: ./setup.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --sound, -s    Install peon-ping for sound notifications"
      echo "  --help, -h     Show this help message"
      exit 0
      ;;
  esac
done

echo "=== cli-rts Setup ==="
echo "Working directory: $(pwd)"

# 1. Build cli-rts
echo ""
echo "--- Building cli-rts ---"
if [ -d "capture" ]; then
  cd capture
  echo "Installing dependencies in capture/..."
  npm install
  echo "Building capture module..."
  npm run build
  cd ..
else
  echo "Error: 'capture' directory not found. Are you in the repo root?"
  exit 1
fi

# 2. Install cli-rts hooks
echo ""
echo "--- Registering cli-rts hooks ---"
# Check if build artifact exists
if [ -f "capture/dist/cli.js" ]; then
  node capture/dist/cli.js init
else
  echo "Error: capture/dist/cli.js not found. Build failed?"
  exit 1
fi

# 3. Install peon-ping (if requested)
if [ "$INSTALL_SOUND" = true ]; then
  echo ""
  echo "--- Installing peon-ping (Sound Support) ---"
  
  # Check for existing peon-ping aliases or hooks to avoid double-installing if already setup
  # But the installer handles updates gracefully, so we can just run it.
  
  echo "Cloning peon-ping to temporary directory..."
  git clone "$PEON_REPO" "$PEON_TMP_DIR"
  
  echo "Running peon-ping installer..."
  # Use a subshell to change directory without affecting this script
  (
    cd "$PEON_TMP_DIR"
    # Run the installer. 
    # We use --local to install config to .claude/ hooks of THIS project?
    # Or globally?
    # The user asked for "setup that enables both... for the user that wants to add both to their project".
    # peon-ping installer defaults to global hooks in ~/.claude/settings.json pointing to ~/.claude/hooks (global)
    # or local hooks if --local is passed.
    # To keep things robust, let's use the default (global install) so sounds work everywhere, 
    # OR we can try local if we want it isolated. 
    # Let's stick to standard global install which is the happy path for peon-ping.
    ./install.sh
  )
  
  echo "Cleaning up..."
  rm -rf "$PEON_TMP_DIR"
  
  echo "peon-ping installation complete."
else
  echo ""
  echo "Skipping sound installation. Pass --sound to enable."
fi

echo ""
echo "=== Setup Complete ==="
echo "Run 'cli-rts start' (or 'node capture/dist/cli.js start') to start the daemon."
if [ "$INSTALL_SOUND" = true ]; then
  echo "Sound notifications are enabled via peon-ping."
fi
