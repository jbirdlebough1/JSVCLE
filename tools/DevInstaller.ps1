<#
.SYNOPSIS
    CLEJS Developer Toolchain Installer
    Locates, validates, and installs all required developer tools into the tools directory.
#>

param(
    [switch]$SkipPlaywright = $false,
    [switch]$Quiet = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$ToolsDir = Join-Path $RootDir "tools"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "       CLEJS Developer Toolchain Installer       " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "Root Directory:  $RootDir"
Write-Host "Tools Directory: $ToolsDir"
Write-Host ""

# -----------------------------------------------------------------
# 1. Embedded Python 3 Runtime (for runtime & installer bundling)
# -----------------------------------------------------------------
Write-Host "[1/5] Checking Embedded Python 3 Runtime in tools\python_runtime..." -ForegroundColor Yellow
$PythonEmbedDir = Join-Path $ToolsDir "python_runtime"
$PythonExe = Join-Path $PythonEmbedDir "python.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "  -> Embedded Python not found. Downloading official Python 3.11 embeddable..." -ForegroundColor Cyan
    $Url = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"
    $ZipPath = Join-Path $ToolsDir "python_embed.zip"
    
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
    New-Item -ItemType Directory -Path $PythonEmbedDir -Force | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $PythonEmbedDir -Force
    Remove-Item $ZipPath -Force
    Write-Host "  [OK] Python 3.11 embeddable runtime installed to tools\python_runtime." -ForegroundColor Green
} else {
    Write-Host "  [OK] Embedded Python 3 runtime is present." -ForegroundColor Green
}

# -----------------------------------------------------------------
# 2. Node.js & npm (for bundling & JS AST syntax checks)
# -----------------------------------------------------------------
Write-Host "[2/5] Checking Node.js runtime..." -ForegroundColor Yellow
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($NodeCmd) {
    $NodeVer = &(node -v)
    Write-Host "  [OK] Node.js is installed ($NodeVer)." -ForegroundColor Green
} else {
    Write-Host "  [!] Node.js not detected in PATH." -ForegroundColor Red
    Write-Host "  -> Attempting install via winget..." -ForegroundColor Cyan
    try {
        winget install OpenJS.NodeJS --accept-package-agreements --accept-source-agreements --silent
        Write-Host "  [OK] Node.js installed via winget." -ForegroundColor Green
    } catch {
        Write-Host "  [WARNING] Please install Node.js manually from https://nodejs.org/" -ForegroundColor Yellow
    }
}

# -----------------------------------------------------------------
# 3. Inno Setup 6 Compiler (ISCC.exe for building installer .exe)
# -----------------------------------------------------------------
Write-Host "[3/5] Checking Inno Setup Compiler (ISCC.exe)..." -ForegroundColor Yellow
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
    Write-Host "  [OK] Inno Setup compiler found at: $FoundISCC" -ForegroundColor Green
} else {
    Write-Host "  [!] Inno Setup compiler not found. Attempting install via winget..." -ForegroundColor Cyan
    try {
        winget install JRSoftware.InnoSetup --accept-package-agreements --accept-source-agreements --silent
        Write-Host "  [OK] Inno Setup installed via winget." -ForegroundColor Green
    } catch {
        Write-Host "  [WARNING] Please install Inno Setup 6 manually from https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    }
}

# -----------------------------------------------------------------
# 4. Python Developer Dependencies (requests, playwright, pyserial)
# -----------------------------------------------------------------
Write-Host "[4/5] Checking Python packages & Playwright..." -ForegroundColor Yellow
$DevPython = Get-Command python -ErrorAction SilentlyContinue
if ($DevPython) {
    Write-Host "  -> Verifying Python development packages..." -ForegroundColor Cyan
    & python -m pip install --quiet requests playwright pyserial
    Write-Host "  [OK] Python packages verified." -ForegroundColor Green

    if (-not $SkipPlaywright) {
        Write-Host "  -> Ensuring Playwright Chromium browser is installed..." -ForegroundColor Cyan
        & python -m playwright install chromium
        Write-Host "  [OK] Playwright Chromium ready." -ForegroundColor Green
    }
} else {
    Write-Host "  [!] Python not found in system PATH." -ForegroundColor Red
}

# -----------------------------------------------------------------
# 5. PrusaSlicer CLI Integration
# -----------------------------------------------------------------
Write-Host "[5/5] Checking PrusaSlicer CLI integration..." -ForegroundColor Yellow
$PrusaDir = Join-Path $ToolsDir "PrusaSlicer"
$SystemPrusa = "C:\Program Files\Prusa3D\PrusaSlicer\prusa-slicer-console.exe"
$LocalPrusa = Join-Path $PrusaDir "prusa-slicer-console.exe"

if (Test-Path $SystemPrusa) {
    Write-Host "  [OK] PrusaSlicer CLI detected at system path: $SystemPrusa" -ForegroundColor Green
} elseif (Test-Path $LocalPrusa) {
    Write-Host "  [OK] PrusaSlicer CLI detected in tools\PrusaSlicer." -ForegroundColor Green
} else {
    New-Item -ItemType Directory -Path $PrusaDir -Force | Out-Null
    Write-Host "  [NOTE] PrusaSlicer not found. Fallback internal slicer is active." -ForegroundColor Yellow
    Write-Host "  -> To enable PrusaSlicer CLI, place prusa-slicer-console.exe in: $PrusaDir" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Green
Write-Host "    CLEJS Developer Toolchain Setup COMPLETE!    " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "You can now run 'build_full_tree.bat' to build and validate the entire project."

