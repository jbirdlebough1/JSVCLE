#!/usr/bin/env bash
# CLEJS One-Click Launcher (Bash)
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "\033[0;34m[CLEJS] Starting local CLE_server on CL3 (http://127.0.0.1:8765)...\033[0m"
nohup python "$PROJECT_ROOT/tools/CLE_server.py" > "$PROJECT_ROOT/tools/server.log" 2>&1 &

sleep 1

echo -e "\033[0;32m[CLEJS] Opening JumpStart 3D with CLEJS Suite...\033[0m"
INDEX_PATH="$PROJECT_ROOT/Dev/index.htm"

if command -v start >/dev/null 2>&1; then
    start "$INDEX_PATH"
elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$INDEX_PATH"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$INDEX_PATH"
elif command -v open >/dev/null 2>&1; then
    open "$INDEX_PATH"
else
    echo "[CLEJS] Open your browser to: $INDEX_PATH"
fi

echo -e "\033[0;36m[CLEJS] System ready.\033[0m"
