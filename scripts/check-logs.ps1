# Quick backend log check
$logs = docker logs --tail 50 rawdrive-backend 2>&1
Write-Host "=== Backend Logs (last 50 lines) ===" -ForegroundColor Yellow
Write-Host $logs -ForegroundColor White
