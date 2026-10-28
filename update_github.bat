@echo off
title Update JSVCLE on GitHub
cd /d "D:\CLEJS"

echo ==========================================================
echo        CLEJS Studio - Update GitHub Tool
echo ==========================================================

python tools\update_github.py

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] Update complete. Press any key to exit.
    pause >nul
) else (
    echo.
    echo [ERROR] Update failed with error code %ERRORLEVEL%.
    pause
)

