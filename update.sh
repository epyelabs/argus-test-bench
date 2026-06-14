#!/usr/bin/env bash
# DEVICE: Raspberry Pi CM5 - RPi OS Bookworm 64-bit Lite
# Pulls latest main; reinstalls deps only if the lockfile changed; rebuilds + relinks `argus`.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$SCRIPT_DIR/argus-cli"

echo "[update] Pulling latest from origin/main..."
before="$(git -C "$SCRIPT_DIR" rev-parse HEAD)"
git -C "$SCRIPT_DIR" pull origin main
after="$(git -C "$SCRIPT_DIR" rev-parse HEAD)"

# Reinstall deps only when the pull actually changed argus-cli's lockfile/manifest.
if [ "$before" != "$after" ] && \
   ! git -C "$SCRIPT_DIR" diff --quiet "$before" "$after" -- argus-cli/package-lock.json argus-cli/package.json; then
  echo "[update] Dependencies changed — running npm ci..."
  npm --prefix "$CLI_DIR" ci
else
  echo "[update] No dependency changes — skipping npm ci."
fi

echo "[update] Rebuilding and linking the 'argus' command..."
# Same as install.sh step 7: build dist/ then (re)link the global `argus` symlink.
( cd "$CLI_DIR" && npm run build && npm link )

echo "[update] Done — 'argus' is up to date."
