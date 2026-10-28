@echo off
title Publish JSVCLE Alpha Release to GitHub
cd /d "D:\CLEJS"

echo ==========================================================
echo    JSVCLE Studio - Alpha Release and Asset Publisher
echo ==========================================================
echo.
echo Target: https://github.com/jbirdlebough1/JSVCLE
echo Tag:    v01.00.66-alpha
echo Assets: User Installer (.exe), Dev Toolkit (.zip), PDFs
echo.

set /p GITHUB_TOKEN="Enter your GitHub Personal Access Token (or press Enter if GITHUB_TOKEN env is set): "

python tools\publish_release.py %GITHUB_TOKEN%

pause

