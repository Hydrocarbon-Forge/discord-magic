#!/usr/bin/env bash
# discord-magic P1 — restore.sh: one-command revert of core.asar from backup.
# Restores the newest backups/core.asar.* (or a file given via --from) over
# the target core.asar, then verifies checksum equality (lossless round-trip).
#
# Usage:
#   scripts/restore.sh [--core PATH] [--backup-dir DIR] [--from FILE] [--live-ok]
# Env overrides: CORE_ASAR, BACKUP_DIR.
# Same safety gate as apply.sh: live target requires --live-ok.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_CORE="$HOME/.config/discord/app-1.0.161/modules/discord_desktop_core-1/discord_desktop_core/core.asar"
CORE_ASAR="${CORE_ASAR:-$LIVE_CORE}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
FROM=""
LIVE_OK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --core) CORE_ASAR="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --live-ok) LIVE_OK=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "restore.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done

if [ "$CORE_ASAR" = "$LIVE_CORE" ] && [ "$LIVE_OK" -ne 1 ]; then
  echo "restore.sh: refusing to touch the LIVE core.asar without --live-ok." >&2
  echo "  For copy-verification use: scripts/restore.sh --core <copy> --backup-dir <tmpdir>" >&2
  exit 3
fi

if [ -z "$FROM" ]; then
  FROM="$(ls -t "$BACKUP_DIR"/core.asar.* 2>/dev/null | head -1 || true)"
fi
[ -n "$FROM" ] && [ -f "$FROM" ] || { echo "restore.sh: no backup found in $BACKUP_DIR" >&2; exit 1; }
echo "[restore] restoring $FROM -> $CORE_ASAR"
cat "$FROM" > "$CORE_ASAR"
cmp -s "$FROM" "$CORE_ASAR" || { echo "[restore] MISMATCH after restore" >&2; exit 1; }
echo "[restore] verified lossless, sha256: $(sha256sum "$CORE_ASAR" | cut -d' ' -f1)"
echo "[restore] done."
