<#
.SYNOPSIS
    Automated GitHub Publisher for CLEJS Studio
    Configures git credentials, links to https://github.com/jcloudfather/CLEJS.git, and pushes main branch.
#>

$ErrorActionPreference = "Stop"
Set-Location "D:\CLEJS"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       CLEJS Studio - GitHub Publishing Script           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Configure Git Identity
Write-Host "`n[1/4] Setting Git identity to jcloudfather..." -ForegroundColor Yellow
git config --global user.name "jcloudfather"
git config --global user.email "jcloudfather@outlook.com"
Write-Host "  [OK] User: jcloudfather <jcloudfather@outlook.com>" -ForegroundColor Green

# 2. Ensure main branch
Write-Host "`n[2/4] Ensuring default branch is 'main'..." -ForegroundColor Yellow
git branch -M main
Write-Host "  [OK] Active branch: main" -ForegroundColor Green

# 3. Configure Remote Origin
$TargetUrl = "https://github.com/jcloudfather/CLEJS.git"
Write-Host "`n[3/4] Configuring remote origin to: $TargetUrl" -ForegroundColor Yellow
$ExistingRemotes = git remote
if ($ExistingRemotes -contains "origin") {
    git remote set-url origin $TargetUrl
    Write-Host "  [OK] Updated existing origin remote." -ForegroundColor Green
} else {
    git remote add origin $TargetUrl
    Write-Host "  [OK] Added new origin remote." -ForegroundColor Green
}

# 4. Push to GitHub
Write-Host "`n[4/4] Pushing code and history to GitHub..." -ForegroundColor Yellow
Write-Host "  -> If prompted by Git Credential Manager, click 'Sign in with your browser'." -ForegroundColor Cyan
Write-Host "  -> If prompted for a password in terminal, paste your GitHub Personal Access Token." -ForegroundColor Cyan

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "   SUCCESS: CLEJS is live at https://github.com/jcloudfather/CLEJS" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "`n[NOTE] If repository does not exist yet on GitHub, please create it at:" -ForegroundColor Yellow
    Write-Host "       https://github.com/new (Name: CLEJS, Visibility: Public)" -ForegroundColor Cyan
}
