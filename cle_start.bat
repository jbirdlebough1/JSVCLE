@echo off
setlocal
cd /d "%~dp0"

echo [JSVCLE] Checking CLE_server service on port 8765...
curl -s http://127.0.0.1:8765/api/status >nul 2>&1
if errorlevel 1 (
    echo [JSVCLE] Starting local CLE_server service in background...
    if exist "%~dp0tools\python_runtime\pythonw.exe" (
        start "" "%~dp0tools\python_runtime\pythonw.exe" "%~dp0tools\CLE_server.py"
    ) else if exist "%~dp0tools\python_runtime\python.exe" (
        start /b "" "%~dp0tools\python_runtime\python.exe" "%~dp0tools\CLE_server.py"
    ) else (
        start "" pythonw "%~dp0tools\CLE_server.py" 2>nul || start /b "" python "%~dp0tools\CLE_server.py"
    )
    timeout /t 1 /nobreak >nul
) else (
    echo [JSVCLE] CLE_server is already running.
)

echo [JSVCLE] Launching JSVCLE Studio (JumpStart 3D + CLE + Vellum Vector Studio)...
start "" "%~dp0Dev\index.htm"

echo [JSVCLE] Application active.
endlocal
