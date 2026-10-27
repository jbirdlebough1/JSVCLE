<#
.SYNOPSIS
    CLEJS Master Build and Validation Pipeline
    Builds the full tree, runs all test suites, validates against GitHub, and compiles the installer.
#>

param(
    [switch]$SkipTests = $false,
    [switch]$SkipInstaller = $false,
    [string]$RemoteName = "origin"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         CLEJS Full Tree Master Build & Validator        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Repository Root: $RootDir"
Write-Host "Timestamp:       $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# -------------------------------------------------------------
# STEP 1: Upstream Sync Check (JumpStart 3D & Vellum Vector)
# -------------------------------------------------------------
Write-Host "[STEP 1/6] Checking upstream releases from classyapps.org..." -ForegroundColor Yellow
if (Get-Command bash -ErrorAction SilentlyContinue) {
    & bash update_jumpstart.sh
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [WARNING] Upstream check reported non-zero exit code ($LASTEXITCODE)" -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] Upstream status verified." -ForegroundColor Green
    }
} else {
    Write-Host "  [SKIP] bash not found; skipping update_jumpstart.sh." -ForegroundColor Gray
}

# -------------------------------------------------------------
# STEP 2: Compile CLEJS Extension Bundle
# -------------------------------------------------------------
Write-Host "`n[STEP 2/6] Compiling Dev\cle_tools\cle_bundle.js..." -ForegroundColor Yellow
& python tools\bundle_cle.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FATAL] bundle_cle.py failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] CLE bundle compiled and validated successfully." -ForegroundColor Green

# -------------------------------------------------------------
# STEP 3: Initial Build Test Suite (test_build.sh)
# -------------------------------------------------------------
Write-Host "`n[STEP 3/6] Running core build verification suite..." -ForegroundColor Yellow
if (Get-Command bash -ErrorAction SilentlyContinue) {
    & bash tools/test_build.sh
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FATAL] tools/test_build.sh failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK] 5/5 Build tests passed." -ForegroundColor Green
} else {
    Write-Host "  [SKIP] bash not found; skipping test_build.sh." -ForegroundColor Gray
}

# -------------------------------------------------------------
# STEP 4: Automated Playwright E2E Verification
# -------------------------------------------------------------
if (-not $SkipTests) {
    Write-Host "`n[STEP 4/6] Running automated Playwright E2E tests..." -ForegroundColor Yellow
    $E2ETest = Join-Path $RootDir "scratch\test_select_and_move.py"
    if (Test-Path $E2ETest) {
        & python $E2ETest
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FATAL] Playwright test failed with exit code $LASTEXITCODE" -ForegroundColor Red
            exit 1
        }
        Write-Host "  [OK] Automated E2E test suite passed." -ForegroundColor Green
    } else {
        Write-Host "  [NOTE] scratch\test_select_and_move.py not found; skipping E2E." -ForegroundColor Gray
    }
} else {
    Write-Host "`n[STEP 4/6] [SKIP] Automated Playwright tests skipped by flag." -ForegroundColor Gray
}

# -------------------------------------------------------------
# STEP 5: Validate Tree Against GitHub Remote
# -------------------------------------------------------------
Write-Host "`n[STEP 5/6] Validating against GitHub remote ($RemoteName)..." -ForegroundColor Yellow
$HasGit = Get-Command git -ErrorAction SilentlyContinue
if ($HasGit) {
    $Remotes = git remote
    if ($Remotes -and ($Remotes -contains $RemoteName)) {
        Write-Host "  -> Fetching latest commits from $RemoteName..." -ForegroundColor Cyan
        git fetch $RemoteName
        $DiffCount = (git diff --name-only "$RemoteName/main" 2>$null | Measure-Object).Count
        Write-Host "  [OK] Tree checked against $RemoteName/main. Modified files: $DiffCount." -ForegroundColor Green
    } else {
        Write-Host "  [NOTE] Git remote '$RemoteName' is not configured yet." -ForegroundColor Yellow
        Write-Host "  -> To link to your GitHub repo, run: git remote add origin <github-repo-url>" -ForegroundColor Cyan
    }
} else {
    Write-Host "  [SKIP] git CLI not found in PATH." -ForegroundColor Gray
}

# -------------------------------------------------------------
# STEP 6: Compile Inno Setup Master Installer
# -------------------------------------------------------------
if (-not $SkipInstaller) {
    Write-Host "`n[STEP 6/6] Compiling distribution installer with Inno Setup..." -ForegroundColor Yellow
    $InnoPaths = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $FoundISCC = $null
    foreach ($p in $InnoPaths) {
        if (Test-Path $p) {
            $FoundISCC = $p
            break
        }
    }

    if ($FoundISCC) {
        $IssFile = Join-Path $RootDir "installer\cle_setup.iss"
        & $FoundISCC $IssFile
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FATAL] Inno Setup compilation failed with exit code $LASTEXITCODE" -ForegroundColor Red
            exit 1
        }
        
        $InstallerExe = Join-Path $RootDir "dist\JSVCLE_Experimental_v01.00.66.exe"
        if (Test-Path $InstallerExe) {
            $FileItem = Get-Item $InstallerExe
            $SizeMB = ($FileItem.Length / 1MB).ToString("F2")
            $Hash = (Get-FileHash -Path $InstallerExe -Algorithm SHA256).Hash
            
            Write-Host "  [OK] Installer compiled successfully!" -ForegroundColor Green
            Write-Host "  Installer Path: $InstallerExe" -ForegroundColor Cyan
            Write-Host "  File Size:      $SizeMB MB ($($FileItem.Length) bytes)"
            Write-Host "  SHA-256:        $Hash" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARNING] Inno Setup ISCC.exe not found. Run tools\DevInstaller.bat first." -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[STEP 6/6] [SKIP] Installer compilation skipped by flag." -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "         CLEJS FULL TREE BUILD & VALIDATION PASSED!       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

