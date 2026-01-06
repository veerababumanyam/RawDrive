# Docker Port Verification Script
# Verifies all containers are running on their assigned ports

Write-Host "`n=== RawDrive Docker Port Verification ===" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n" -ForegroundColor Gray

# Get all running containers with their ports
Write-Host "=== Running Containers and Port Mappings ===" -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}|{{.Ports}}" | ConvertFrom-Csv -Delimiter '|' -Header Name,Ports

# Sort and display
$containers | Sort-Object Name | ForEach-Object {
    Write-Host "$($_.Name.PadRight(35)) $($_.Ports)" -ForegroundColor Green
}

Write-Host "`n=== Port Allocation Summary ===" -ForegroundColor Yellow

# Infrastructure Services
Write-Host "`nInfrastructure Services:" -ForegroundColor Cyan
$infraPorts = @{
    "Traefik HTTP" = 80
    "Traefik HTTPS" = 443
    "Traefik Dashboard" = 8080
    "Traefik Metrics" = 8082
    "PostgreSQL" = 5432
    "Redis" = 6379
    "PgBouncer" = 6432
    "Prometheus" = 9090
    "Alertmanager" = 9093
    "Grafana" = 3000
    "Loki" = 3100
    "Promtail" = 9080
}

foreach ($service in $infraPorts.GetEnumerator() | Sort-Object Value) {
    Write-Host "  $($service.Key.PadRight(25)) Port: $($service.Value)" -ForegroundColor White
}

# Application Microservices
Write-Host "`nApplication Microservices:" -ForegroundColor Cyan
$appPorts = @{
    "Backend" = 8000
    "Face Worker" = 8001
    "Content Worker" = 8002
    "Quality Worker" = 8003
    "Gallery Service" = 8004
    "Billing Service" = 8005
    "Onboarding Service" = 8006
    "Invitations API" = 8007
    "Upload Service" = 8008
    "Invitations Worker" = 8009
}

foreach ($service in $appPorts.GetEnumerator() | Sort-Object Value) {
    Write-Host "  $($service.Key.PadRight(25)) Port: $($service.Value)" -ForegroundColor White
}

# Test health endpoints
Write-Host "`n=== Health Check Tests ===" -ForegroundColor Yellow

$healthChecks = @(
    @{Port=8000; Service="Backend"},
    @{Port=8001; Service="Face Worker"},
    @{Port=8002; Service="Content Worker"},
    @{Port=8003; Service="Quality Worker"},
    @{Port=8004; Service="Gallery Service"},
    @{Port=8005; Service="Billing Service"},
    @{Port=8006; Service="Onboarding Service"},
    @{Port=8007; Service="Invitations API"},
    @{Port=8008; Service="Upload Service"}
)

foreach ($check in $healthChecks) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$($check.Port)/health" -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "  [OK] $($check.Service.PadRight(25)) http://localhost:$($check.Port)/health - OK" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] $($check.Service.PadRight(25)) http://localhost:$($check.Port)/health - Status: $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [FAIL] $($check.Service.PadRight(25)) http://localhost:$($check.Port)/health - FAILED" -ForegroundColor Red
    }
}

# Check for port conflicts
Write-Host "`n=== Port Conflict Check ===" -ForegroundColor Yellow

$allPorts = $infraPorts.Values + $appPorts.Values | Sort-Object -Unique
$conflicts = @()

foreach ($port in $allPorts) {
    $connections = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
    if ($connections) {
        $count = ($connections | Measure-Object).Count
        if ($count -gt 1) {
            $conflicts += $port
            Write-Host "  [WARN] Port $port has $count listeners (potential conflict)" -ForegroundColor Yellow
        } else {
            Write-Host "  [OK] Port $port - OK (1 listener)" -ForegroundColor Green
        }
    }
}

if ($conflicts.Count -eq 0) {
    Write-Host "`nNo port conflicts detected!" -ForegroundColor Green
} else {
    Write-Host "`nWarning: Potential conflicts on ports: $($conflicts -join ', ')" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Yellow
$runningCount = ($containers | Measure-Object).Count
Write-Host "  Total containers running: $runningCount" -ForegroundColor White
Write-Host "  Infrastructure services: $($infraPorts.Count)" -ForegroundColor White
Write-Host "  Application microservices: $($appPorts.Count)" -ForegroundColor White

Write-Host "`n=== Verification Complete ===" -ForegroundColor Cyan
