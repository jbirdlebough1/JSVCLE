@echo off
setlocal
cd /d "%~dp0"

rem Check if CLE_server is already running on port 8765
curl -s http://127.0.0.1:8765/api/status >nul 2>&1
if not errorlevel 1 (
    exit /b 0
)

rem Prefer bundled embedded pythonw, then system pythonw, then python
if exist "%~dp0tools\python_runtime\pythonw.exe" (
    start "" "%~dp0tools\python_runtime\pythonw.exe" "%~dp0tools\CLE_server.py"
) else if exist "%~dp0tools\python_runtime\python.exe" (
    start /b "" "%~dp0tools\python_runtime\python.exe" "%~dp0tools\CLE_server.py"
) else (
    start "" pythonw "%~dp0tools\CLE_server.py" 2>nul || start /b "" python "%~dp0tools\CLE_server.py"
)

endlocal

