#!/usr/bin/env bash
# CLEJS Automated Checkpoint & Zero-Information-Loss Sync Script
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_MSG="${1:-Checkpoint $(date '+%Y-%m-%d %H:%M:%S')}"
CONV_ID="${2:-c1c01b32-0294-42e0-a526-18f205e9d6d5}"

# Locate Brain Directory (handles Windows / Linux / macOS paths)
if [ -n "$USERPROFILE" ]; then
    BRAIN_DIR="$USERPROFILE/.gemini/antigravity/brain/$CONV_ID/.system_generated/logs"
else
    BRAIN_DIR="$HOME/.gemini/antigravity/brain/$CONV_ID/.system_generated/logs"
fi

SESSION_TARGET="$PROJECT_ROOT/sessions/$CONV_ID"
mkdir -p "$SESSION_TARGET"

# 1. Sync session transcripts
if [ -d "$BRAIN_DIR" ]; then
    if [ -f "$BRAIN_DIR/transcript.jsonl" ]; then
        cp -f "$BRAIN_DIR/transcript.jsonl" "$SESSION_TARGET/"
    fi
    if [ -f "$BRAIN_DIR/transcript_full.jsonl" ]; then
        cp -f "$BRAIN_DIR/transcript_full.jsonl" "$SESSION_TARGET/"
    fi
    echo -e "\033[0;32m[CLEJS] Synced session transcripts from $BRAIN_DIR\033[0m"
else
    echo -e "\033[0;33m[CLEJS] Warning: Brain directory not found at $BRAIN_DIR. Proceeding with commit.\033[0m"
fi

# 2. Update session metadata using python
INFO_FILE="$SESSION_TARGET/session-info.json"
if [ -f "$INFO_FILE" ]; then
    python -c "
import json, datetime
try:
    with open(r'$INFO_FILE', 'r', encoding='utf-8') as f:
        meta = json.load(f)
    meta['last_checkpoint'] = datetime.datetime.now().isoformat()
    meta['checkpoint_count'] = int(meta.get('checkpoint_count', 0)) + 1
    with open(r'$INFO_FILE', 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
except Exception as e:
    print('Metadata update warning:', e)
"
fi

# 3. Stage and commit
cd "$PROJECT_ROOT"
git add .
if git status --porcelain | grep -q .; then
    git commit -m "[Session $CONV_ID] $COMMIT_MSG"
    echo -e "\033[0;36m[CLEJS] Successfully committed checkpoint: $COMMIT_MSG\033[0m"
else
    echo -e "\033[0;33m[CLEJS] Working tree clean, nothing to commit.\033[0m"
fi
