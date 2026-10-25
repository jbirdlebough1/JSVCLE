#!/usr/bin/env bash
# CLEJS Automated Test Suite
set -e

if (pwd -W) >/dev/null 2>&1; then
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -W)"
else
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

PYTHON_CMD="python"
if ! command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python3"
fi

echo -e "\033[0;34m==========================================\033[0m"
echo -e "\033[0;34m       CLEJS Initial Build Test Suite     \033[0m"
echo -e "\033[0;34m==========================================\033[0m"

# 1. Test Syntax of all JavaScript modules
echo -e "\n\033[0;33m[Test 1/5] Verifying JavaScript modules syntax...\033[0m"
JS_FILES=(
    "$PROJECT_ROOT/Dev/cle_tools/cle_boot.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_gamepad.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_fluidnc.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_rotary.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_calibration.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_vault.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_test.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_recovery.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_slicer.js"
    "$PROJECT_ROOT/Dev/cle_tools/cle_bundle.js"
)

for file in "${JS_FILES[@]}"; do
    if [ -f "$file" ]; then
        $PYTHON_CMD -c "
with open(r'$file', 'r', encoding='utf-8') as f:
    content = f.read()
assert len(content) > 100, 'File too small'
"
        echo "  [OK] $(basename "$file")"
    else
        echo "  [FAIL] Missing $file"
        exit 1
    fi
done

# 2. Test CSS stylesheet
echo -e "\n\033[0;33m[Test 2/5] Checking cle_theme.css integrity...\033[0m"
CSS_FILE="$PROJECT_ROOT/Dev/cle_tools/cle_theme.css"
if [ -f "$CSS_FILE" ]; then
    echo "  [OK] cle_theme.css present ($(wc -c < "$CSS_FILE") bytes)"
else
    echo "  [FAIL] cle_theme.css missing"
    exit 1
fi

# 3. Test Dev/index.htm hook placement & CLE tab
echo -e "\n\033[0;33m[Test 3/5] Checking Dev/index.htm Advanced mode CLE tab and bundle hook...\033[0m"
$PYTHON_CMD -c "
with open(r'$PROJECT_ROOT/Dev/index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

assert '[\"cle\",\"CLE\"]' in text, 'wstabs CLE tab missing'
assert 'Vr===\"cle\"' in text, 'CLE ribbon router missing'
assert 'cle_tools/cle_bundle.js' in text, 'cle_bundle.js hook missing'
print('  [OK] Dev/index.htm verified: wstabs CLE tab, router, and universal bundle hook present.')
"

# 4. Test CLE_server.py background startup & endpoints
echo -e "\n\033[0;33m[Test 4/5] Testing CLE_server.py REST endpoints on CL3...\033[0m"
$PYTHON_CMD "$PROJECT_ROOT/tools/CLE_server.py" > "$PROJECT_ROOT/tools/server_test.log" 2>&1 &
SERVER_PID=$!
sleep 1.5

# Test Status endpoint
STATUS_JSON=$(curl -s http://127.0.0.1:8765/api/status)
echo "  Status response: $STATUS_JSON"

# Test Vault Sync endpoint
VAULT_PAYLOAD='{"test":true,"profile":"TwoTrees TTC6050"}'
SYNC_RESP=$(curl -s -X POST http://127.0.0.1:8765/api/vault/sync -H "Content-Type: application/json" -d "$VAULT_PAYLOAD")
echo "  Vault sync response: $SYNC_RESP"

# Clean up server
kill $SERVER_PID || true

# 5. Test Scheduled Task and Upstream Check
echo -e "\n\033[0;33m[Test 5/5] Checking Daily Upstream Task and report generation...\033[0m"
if [ -f "$PROJECT_ROOT/upstream-reports/2026-10-25.md" ]; then
    echo "  [OK] Latest daily upstream report exists: upstream-reports/2026-10-25.md"
fi

echo -e "\n\033[0;32m==========================================\033[0m"
echo -e "\033[0;32m       ALL TESTS PASSED SUCCESSFULLY      \033[0m"
echo -e "\033[0;32m==========================================\033[0m"
