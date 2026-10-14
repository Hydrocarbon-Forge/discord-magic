#!/usr/bin/env bash
# discord-magic P1 — apply.sh: backup + one-hook patch of core.asar.
#
# Default target is the LIVE install:
#   ~/.config/discord/app-1.0.161/modules/discord_desktop_core-1/discord_desktop_core/core.asar
# SAFETY GATE: targeting the live path requires --live-ok. Copy-verification
# runs pass --core <copy> --backup-dir <tmp> and never touch the live file.
#
# Usage:
#   scripts/apply.sh [--core PATH] [--backup-dir DIR] [--sidecar-dir DIR] [--live-ok]
# Env overrides: CORE_ASAR, BACKUP_DIR, SIDECAR_DIR, SKIP_SIDECAR_INSTALL=1.
#
# Steps: byte-for-byte backup -> install sidecar -> extract asar ->
# single anchored string replace (checksum-verified, idempotent) -> repack.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_CORE="$HOME/.config/discord/app-1.0.161/modules/discord_desktop_core-1/discord_desktop_core/core.asar"
CORE_ASAR="${CORE_ASAR:-$LIVE_CORE}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
SIDECAR_DIR="${SIDECAR_DIR:-$HOME/.config/discord-magic}"
LIVE_OK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --core) CORE_ASAR="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --sidecar-dir) SIDECAR_DIR="$2"; shift 2 ;;
    --live-ok) LIVE_OK=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "apply.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done

if [ "$CORE_ASAR" = "$LIVE_CORE" ] && [ "$LIVE_OK" -ne 1 ]; then
  echo "apply.sh: refusing to patch the LIVE core.asar without --live-ok." >&2
  echo "  Live apply is human-gated. For copy-verification use:" >&2
  echo "    scripts/apply.sh --core <copy-of-core.asar> --backup-dir <tmpdir> [--sidecar-dir <tmpdir>]" >&2
  exit 3
fi

[ -f "$CORE_ASAR" ] || { echo "apply.sh: core.asar not found: $CORE_ASAR" >&2; exit 1; }
command -v python3 >/dev/null || { echo "apply.sh: python3 required" >&2; exit 1; }
command -v npx >/dev/null || { echo "apply.sh: npx required (for asar)" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/dm-apply.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
echo "[apply] extracting asar -> $TMP/extract"
npx --yes asar extract "$CORE_ASAR" "$TMP/extract"
BUNDLE="$TMP/extract/bundle.js"
[ -f "$BUNDLE" ] || { echo "[apply] bundle.js missing after extract" >&2; exit 1; }

ANCHOR='loadingDragCssPromises.push(mainWindow.webContents.insertCSS("body { -webkit-app-region: drag; }").catch(()=>null))'
MARKER='discord-magic-loader-v1'

PRE_ANCHOR_N="$(grep -o -F "$ANCHOR" "$BUNDLE" | wc -l)"
PRE_MARKER_N="$(grep -o -F "$MARKER" "$BUNDLE" | wc -l || true)"
echo "[apply] pre-patch anchor count: $PRE_ANCHOR_N, marker count: $PRE_MARKER_N"

if [ "$PRE_MARKER_N" -ge 1 ]; then
  if [ "$PRE_ANCHOR_N" -eq 1 ]; then
    echo "[apply] already patched (idempotent) — anchor intact, nothing to do."
    exit 0
  else
    echo "[apply] marker present but anchor count=$PRE_ANCHOR_N (expected 1). Refusing." >&2
    exit 1
  fi
fi
[ "$PRE_ANCHOR_N" -eq 1 ] || { echo "[apply] anchor must appear EXACTLY once (found $PRE_ANCHOR_N). Refusing." >&2; exit 1; }

# Byte-for-byte backup AFTER the read-only checks, BEFORE any modification.
BACKUP="$BACKUP_DIR/core.asar.$TS"
echo "[apply] backing up $CORE_ASAR -> $BACKUP"
cp -a "$CORE_ASAR" "$BACKUP"
cmp -s "$CORE_ASAR" "$BACKUP" || { echo "[apply] backup MISMATCH (not byte-for-byte)" >&2; exit 1; }
echo "[apply] backup verified byte-for-byte, sha256: $(sha256sum "$BACKUP" | cut -d' ' -f1)"
echo "[apply] pre-patch sha256:  $(sha256sum "$CORE_ASAR" | cut -d' ' -f1)"

if [ "${SKIP_SIDECAR_INSTALL:-0}" != "1" ]; then
  echo "[apply] installing sidecar -> $SIDECAR_DIR"
  mkdir -p "$SIDECAR_DIR/payload/css"
  cp -a "$REPO_DIR/loader/loader-v1.js" "$SIDECAR_DIR/loader-v1.js"
  cp -a "$REPO_DIR/payload/mod.js" "$REPO_DIR/payload/stores.js" "$REPO_DIR/payload/physics.js" "$SIDECAR_DIR/payload/"
  cp -a "$REPO_DIR/payload/css/glass.css" "$REPO_DIR/payload/css/foil.css" "$SIDECAR_DIR/payload/css/"
  echo "[apply] sidecar installed."
else
  echo "[apply] SKIP_SIDECAR_INSTALL=1, sidecar copy skipped."
fi

HOOK='/*discord-magic-loader-v1*/;try{require(process.env.DISCORD_MAGIC_LOADER||(function(){try{return require("os").homedir()}catch(e){return process.env.HOME||"/tmp"}})()+"/.config/discord-magic/loader-v1.js").attach(mainWindow);}catch(e){console.error("[discord-magic] loader attach failed:",e&&e.message||e);}'
export ANCHOR HOOK BUNDLE
python3 - <<'PYEOF'
import os
bundle = os.environ['BUNDLE']
anchor = os.environ['ANCHOR']
hook = os.environ['HOOK']
src = open(bundle, 'r', encoding='utf-8').read()
assert src.count(anchor) == 1, f"anchor count {src.count(anchor)} != 1"
assert 'discord-magic-loader-v1' not in src, "already patched"
open(bundle, 'w', encoding='utf-8').write(src.replace(anchor, anchor + hook, 1))
print("[apply] string-replace done")
PYEOF

POST_ANCHOR_N="$(grep -o -F "$ANCHOR" "$BUNDLE" | wc -l)"
POST_MARKER_N="$(grep -o -F "$MARKER" "$BUNDLE" | wc -l)"
echo "[apply] post-patch anchor count: $POST_ANCHOR_N, marker count: $POST_MARKER_N"
[ "$POST_ANCHOR_N" -eq 1 ] || { echo "[apply] post-patch anchor != 1" >&2; exit 1; }
[ "$POST_MARKER_N" -eq 1 ] || { echo "[apply] post-patch marker != 1" >&2; exit 1; }

echo "[apply] repacking asar"
npx --yes asar pack "$TMP/extract" "$TMP/core.asar.new" >/dev/null
npx --yes asar list "$TMP/core.asar.new" | head -5
cat "$TMP/core.asar.new" > "$CORE_ASAR"
echo "[apply] post-patch sha256: $(sha256sum "$CORE_ASAR" | cut -d' ' -f1)"
echo "[apply] done. Restore with: scripts/restore.sh --core $CORE_ASAR --backup-dir $BACKUP_DIR"
