$ErrorActionPreference = 'Stop'

$projectRoot = 'D:\CLEJS'
$originalPath = Join-Path $projectRoot 'JSoriginal\index.htm'
$devPath = Join-Path $projectRoot 'Dev\index.htm'
$historyPath = Join-Path $projectRoot 'JSoriginal_history'
$reportsPath = Join-Path $projectRoot 'upstream-reports'
$siteUri = [uri]'https://classyapps.org/'

New-Item -ItemType Directory -Force -Path $historyPath, $reportsPath | Out-Null

$page = Invoke-WebRequest -Uri $siteUri -UseBasicParsing -TimeoutSec 60
$matches = [regex]::Matches(
    $page.Content,
    'href\s*=\s*["'']([^"'']*jumpstart_3d_v[\d.]+\.htm)["'']',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

$appUri = $null
foreach ($match in $matches) {
    $href = [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
    $candidate = [uri]::new($siteUri, $href)
    if ($candidate.Host -eq 'classyapps.org' -and $candidate.AbsolutePath -match '^/assets/jumpstart_3d_v[\d.]+\.htm$') {
        $appUri = $candidate
        break
    }
}

if ($null -eq $appUri) {
    throw 'Could not find the official JumpStart 3D app download link on classyapps.org.'
}

$tempPath = Join-Path $projectRoot (".jumpstart3d-{0}.htm" -f [guid]::NewGuid().ToString('N'))
try {
    Invoke-WebRequest -Uri $appUri -OutFile $tempPath -UseBasicParsing -TimeoutSec 180
    $download = Get-Item $tempPath
    if ($download.Length -lt 1MB) {
        throw "Downloaded app is unexpectedly small ($($download.Length) bytes); leaving JSoriginal unchanged."
    }

    $stream = [System.IO.File]::OpenRead($tempPath)
    try {
        $buffer = New-Object byte[] 4096
        $read = $stream.Read($buffer, 0, $buffer.Length)
        $preview = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
    } finally {
        $stream.Dispose()
    }

    if ($preview -notmatch '(?i)JumpStart') {
        throw 'Downloaded file did not contain expected JumpStart content; leaving JSoriginal unchanged.'
    }

    $upstreamHash = (Get-FileHash -LiteralPath $tempPath -Algorithm SHA256).Hash
    $previousHash = $null
    $previousLength = $null
    if (Test-Path -LiteralPath $originalPath) {
        $previousLength = (Get-Item -LiteralPath $originalPath).Length
        $previousHash = (Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash
    }

    $changed = $upstreamHash -ne $previousHash
    if ($changed) {
        if (Test-Path -LiteralPath $originalPath) {
            $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $backupPath = Join-Path $historyPath "index-$stamp-$($previousHash.Substring(0, 12)).htm"
            Copy-Item -LiteralPath $originalPath -Destination $backupPath
        }

        $replacePath = "$originalPath.new"
        Copy-Item -LiteralPath $tempPath -Destination $replacePath -Force
        Move-Item -LiteralPath $replacePath -Destination $originalPath -Force
    }

    $devHash = $null
    $devLength = $null
    if (Test-Path -LiteralPath $devPath) {
        $devItem = Get-Item -LiteralPath $devPath
        $devLength = $devItem.Length
        $devHash = (Get-FileHash -LiteralPath $devPath -Algorithm SHA256).Hash
    }

    $devComparison = if ($null -eq $devHash) {
        'Dev/index.htm not found'
    } elseif ($devHash -eq $upstreamHash) {
        'Identical to upstream'
    } else {
        'Different from upstream'
    }
    $previousComparison = if ($changed) { 'Updated' } else { 'No change' }
    $version = [System.IO.Path]::GetFileNameWithoutExtension($appUri.AbsolutePath) -replace '^jumpstart_3d_', ''
    $date = Get-Date -Format 'yyyy-MM-dd'
    $reportPath = Join-Path $reportsPath "$date.md"
    $backupSummary = if ($changed -and $previousHash) {
        "Previous JSoriginal saved to ``JSoriginal_history/index-$stamp-$($previousHash.Substring(0, 12)).htm``."
    } else {
        'No prior-version backup was needed.'
    }
    $devHashDisplay = if ($devHash) { $devHash } else { 'Not available' }
    $devLengthDisplay = if ($null -ne $devLength) { $devLength } else { 'Not available' }
    $previousHashDisplay = if ($previousHash) { $previousHash } else { 'No prior file' }
    $previousLengthDisplay = if ($null -ne $previousLength) { $previousLength } else { 'Not available' }
    $report = @"
# JumpStart 3D upstream check - $date

- Source page: https://classyapps.org/
- Downloaded app: $($appUri.AbsoluteUri)
- Upstream version from filename: $version
- Upstream status vs previous JSoriginal: $previousComparison
- $backupSummary
- Dev was not modified.

| File | Previous JSoriginal SHA-256 | Previous size (bytes) | Upstream SHA-256 | Upstream size (bytes) | Dev SHA-256 | Dev size (bytes) | Upstream vs Dev |
|---|---|---:|---|---:|---|---:|---|
| index.htm | $previousHashDisplay | $previousLengthDisplay | $upstreamHash | $($download.Length) | $devHashDisplay | $devLengthDisplay | $devComparison |

## Review notes

The source is a single bundled HTML file. The table records exact hashes and sizes for reproducible comparison; `Different from upstream` means the customized Dev copy should be reviewed against the upstream version. The automated check does not merge upstream changes into Dev.
"@
    Set-Content -LiteralPath $reportPath -Value $report -Encoding UTF8
    Write-Output "Check complete: $reportPath"
} finally {
    if (Test-Path -LiteralPath $tempPath) {
        Remove-Item -LiteralPath $tempPath -Force
    }
}
