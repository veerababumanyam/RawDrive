param(
    [switch]$SkipPush,
    [switch]$NoCache,
    [switch]$Pull
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$gitBashCandidates = @(
    "${env:ProgramFiles}\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $gitBashCandidates) {
    throw "Git Bash was not found. Install Git for Windows or run deploy/scripts/deploy-prod.sh from a supported Linux/macOS shell."
}

$gitBash = @($gitBashCandidates)[0]
$argsList = @("deploy/scripts/deploy-prod.sh")
if ($SkipPush) { $argsList += "--skip-push" }
if ($NoCache) { $argsList += "--no-cache" }
if ($Pull) { $argsList += "--pull" }

Push-Location $repoRoot
try {
    & $gitBash @argsList
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
