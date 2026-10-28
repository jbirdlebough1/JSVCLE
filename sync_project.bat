@echo off
title Sync CLEBUGGER Issues to GitHub Project
cd /d "D:\CLEJS"

echo ==========================================================
echo    JSVCLE Studio - GitHub Issues and Project Sync Tool
echo ==========================================================
echo.
echo Target: https://github.com/jbirdlebough1/JSVCLE/issues
echo Syncs:  CLEJS-001 through CLEJS-005 from CLEBUGGER
echo.

set /p GITHUB_TOKEN="Enter your GitHub Personal Access Token: "

python tools\sync_github_project.py %GITHUB_TOKEN%

pause

