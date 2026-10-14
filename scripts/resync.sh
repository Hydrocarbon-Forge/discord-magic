#!/usr/bin/env bash
# discord-magic W2 — resync.sh: deploy repo payload into the LIVE sidecar dir.
#
# Background: the core.asar one-hook patch resolves the payload ONCE per
# attach() to ~/.config/discord-magic/payload/ (live dir), while
# buildBootstrap() re-reads payload files fresh on every injection — so a
# plain Discord relaunch picks up new files, but ONLY after they are copied
# into the live dir. This script is that copy. It touches ONLY
# ~/.config/discord-magic/ — NEVER ~/.config/discord/ (the live client).
#
# Usage: scripts/resync.sh [--force]
#   Refuses to run from a dirty git tree unless --force is given.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="$HOME/.config/discord-magic"
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "resync.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done

if [ "$FORCE" -ne 1 ]; then
  if ! git -C "$REPO_DIR" diff --quiet || ! git -C "$REPO_DIR" diff --cached --quiet; then
    echo "resync.sh: refusing — git tree is dirty. Commit first or pass --force." >&2
    git -C "$REPO_DIR" status --short >&2
    exit 1
  fi
  # Untracked files also count as dirty (except git-ignored scratch/backups).
  if [ -n "$(git -C "$REPO_DIR" ls-files --others --exclude-standard)" ]; then
    echo "resync.sh: refusing — untracked files present. Commit first or pass --force." >&2
    git -C "$REPO_DIR" ls-files --others --exclude-standard >&2
    exit 1
  fi
fi

FILES=(
  "loader/loader-v1.js:loader-v1.js"
  "payload/mod.js:payload/mod.js"
  "payload/stores.js:payload/stores.js"
  "payload/physics.js:payload/physics.js"
  "payload/css/glass.css:payload/css/glass.css"
  "payload/css/foil.css:payload/css/foil.css"
)

echo "[resync] repo: $REPO_DIR -> live: $LIVE_DIR"
mkdir -p "$LIVE_DIR/payload/css"

CHANGED=0
for spec in "${FILES[@]}"; do
  src_rel="${spec%%:*}"
  dst_rel="${spec##*:}"
  src="$REPO_DIR/$src_rel"
  dst="$LIVE_DIR/$dst_rel"
  [ -f "$src" ] || { echo "[resync] MISSING source: $src" >&2; exit 1; }
  before=" absent "
  [ -f "$dst" ] && before="$(sha256sum "$dst" | cut -d' ' -f1 | cut -c1-12)"
  after_src="$(sha256sum "$src" | cut -d' ' -f1)"
  cp -a "$src" "$dst"
  after="$(sha256sum "$dst" | cut -d' ' -f1)"
  [ "$after" = "$after_src" ] || { echo "[resync] copy MISMATCH: $dst_rel" >&2; exit 1; }
  if [ "$before" = "$(echo "$after" | cut -c1-12)" ]; then
    echo "[resync] unchanged $dst_rel  $after"
  else
    echo "[resync] updated   $dst_rel  $before -> $(echo "$after" | cut -c1-12)"
    CHANGED=$((CHANGED + 1))
  fi
done

# Syntax-check every deployed JS file.
for f in "$LIVE_DIR/loader-v1.js" "$LIVE_DIR/payload/mod.js" \
         "$LIVE_DIR/payload/stores.js" "$LIVE_DIR/payload/physics.js"; do
  node --check "$f" || { echo "[resync] node --check FAILED: $f" >&2; exit 1; }
done
echo "[resync] node --check clean on all deployed JS."

echo "[resync] done ($CHANGED file(s) updated). Relaunch Discord to pick this up."
echo "[resync] live core.asar was NOT touched (payload-level deploy only)."
