# Enable DEBUG logging for magic link debugging
# Usage: . .\enable_magic_link_debug.ps1

$env:LOG_LEVEL = "DEBUG"
$env:DEBUG_MAGIC_LINKS = "true"
$env:LOG_FORMAT = "console"

Write-Host "✅ Debug logging enabled for magic links" -ForegroundColor Green
Write-Host "   LOG_LEVEL=$env:LOG_LEVEL"
Write-Host "   DEBUG_MAGIC_LINKS=$env:DEBUG_MAGIC_LINKS"
Write-Host "   LOG_FORMAT=$env:LOG_FORMAT"
Write-Host ""
Write-Host "Restart your backend server to apply changes" -ForegroundColor Yellow
