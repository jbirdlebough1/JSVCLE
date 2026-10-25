#!/usr/bin/env bash
# CLEJS Automated Checkpoint & Zero-Information-Loss Sync Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_MSG="${1:-Checkpoint $(date '+%Y-%m-%d %H:%M:%S')}"
CONV_ID="${2:-c1c01b32-0294-42e0-a526-18f205e9d6d5}"

# Detect Windows vs POSIX paths
if command -v cygpath >/dev/null 2>&1; then
    PROJECT_ROOT="$(cygpath -w "$SCRIPT_DIR")"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi

if [ -n "$USERPROFILE" ]; then
    BRAIN_DIR="$USERPROFILE/.gemini/antigravity/brain/$CONV_ID/.system_generated/logs"
else
    BRAIN_DIR="$HOME/.gemini/antigravity/brain/$CONV_ID/.system_generated/logs"
fi

SESSION_TARGET="$PROJECT_ROOT\\sessions\\$CONV_ID"
if [ ! -d "$SESSION_TARGET" ]; then
    mkdir -p "$SCRIPT_DIR/sessions/$CONV_ID"
fi

# 1. Sync session transcripts
if [ -d "$BRAIN_DIR" ]; then
    if [ -f "$BRAIN_DIR/transcript.jsonl" ]; then
        cp -f "$BRAIN_DIR/transcript.jsonl" "$SCRIPT_DIR/sessions/$CONV_ID/"
    fi
    if [ -f "$BRAIN_DIR/transcript_full.jsonl" ]; then
        cp -f "$BRAIN_DIR/transcript_full.jsonl" "$SCRIPT_DIR/sessions/$CONV_ID/"
    fi
    echo -e "\033[0;32m[CLEJS] Synced session transcripts from $BRAIN_DIR\033[0m"
else
    echo -e "\033[0;33m[CLEJS] Warning: Brain directory not found at $BRAIN_DIR. Proceeding with commit.\033[0m"
fi

# 2. Update session metadata using python
INFO_FILE="$SCRIPT_DIR/sessions/$CONV_ID/session-info.json"
if [ -f "$INFO_FILE" ]; then
    python -c "
import json, datetime
info_path = r'$INFO_FILE'
try:
    with open(info_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)
    meta['last_checkpoint'] = datetime.datetime.now().isoformat()
    meta['checkpoint_count'] = int(meta.get('checkpoint_count', 0)) + 1
    with open(info_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
except Exception as e:
    print('Metadata update warning:', e)
"
fi

# 3. Stage and commit
cd "$SCRIPT_DIR"
git add .
if git status --porcelain | grep -q .; then
    git commit -m "[Session $CONV_ID] $COMMIT_MSG"
    echo -e "\033[0;36m[CLEJS] Successfully committed checkpoint: $COMMIT_MSG\033[0m"
else
    echo -e "\033[0;33m[CLEJS] Working tree clean, nothing to commit.\033[0m"
fi
