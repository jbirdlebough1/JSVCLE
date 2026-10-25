param (
    [string]$CommitMessage = "Checkpoint $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    [string]$ConversationId = "c1c01b32-0294-42e0-a526-18f205e9d6d5"
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = "D:\CLEJS" }

$brainDir = Join-Path $env:USERPROFILE ".gemini\antigravity\brain\$ConversationId\.system_generated\logs"
$sessionTargetDir = Join-Path $projectRoot "sessions\$ConversationId"

if (-not (Test-Path $sessionTargetDir)) {
    New-Item -ItemType Directory -Path $sessionTargetDir -Force | Out-Null
}

# 1. Sync session transcripts
if (Test-Path $brainDir) {
    $transcript = Join-Path $brainDir "transcript.jsonl"
    $transcriptFull = Join-Path $brainDir "transcript_full.jsonl"
    if (Test-Path $transcript) {
        Copy-Item -Path $transcript -Destination $sessionTargetDir -Force
    }
    if (Test-Path $transcriptFull) {
        Copy-Item -Path $transcriptFull -Destination $sessionTargetDir -Force
    }
    Write-Host "[CLEJS] Synced session transcripts from $brainDir" -ForegroundColor Green
} else {
    Write-Warning "[CLEJS] Brain directory not found at $brainDir. Proceeding with repository commit."
}

# 2. Update session metadata if it exists
$infoFile = Join-Path $sessionTargetDir "session-info.json"
if (Test-Path $infoFile) {
    try {
        $meta = Get-Content -Raw $infoFile | ConvertFrom-Json
        $meta.last_checkpoint = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
        $meta.checkpoint_count = [int]$meta.checkpoint_count + 1
        $meta | ConvertTo-Json -Depth 5 | Set-Content -Path $infoFile
    } catch {
        Write-Warning "[CLEJS] Failed to update session-info.json: $_"
    }
}

# 3. Stage and commit
Set-Location -Path $projectRoot
git add .
$status = git status --porcelain
if ($status) {
    git commit -m "[Session $ConversationId] $CommitMessage"
    Write-Host "[CLEJS] Successfully committed checkpoint: $CommitMessage" -ForegroundColor Cyan
} else {
    Write-Host "[CLEJS] Working tree clean, nothing to commit." -ForegroundColor Yellow
}
