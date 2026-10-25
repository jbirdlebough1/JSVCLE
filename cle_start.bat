@echo off
setlocal
cd /d "%~dp0"

echo [CLEJS] Starting local CLE_server on CL3 (http://127.0.0.1:8765)...
start /b "" python "%~dp0tools\CLE_server.py"

timeout /t 1 /nobreak >nul

echo [CLEJS] Opening JumpStart 3D with CLEJS Suite...
start "" "%~dp0Dev\index.htm"

echo [CLEJS] System ready.
endlocal
