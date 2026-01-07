# Test logging service with different test users
# Password for all test users: Test@123

$baseUrl = "http://localhost:8000"
$testUsers = @(
    @{
        email = "free@test.rawdrive.in"
        uuid = "11111111-1111-1111-1111-111111111001"
        plan = "Free"
    },
    @{
        email = "starter@test.rawdrive.in"
        uuid = "11111111-1111-1111-1111-111111111002"
        plan = "Starter"
    },
    @{
        email = "professional@test.rawdrive.in"
        uuid = "11111111-1111-1111-1111-111111111003"
        plan = "Professional"
    },
    @{
        email = "business@test.rawdrive.in"
        uuid = "11111111-1111-1111-1111-111111111004"
        plan = "Business"
    },
    @{
        email = "enterprise@test.rawdrive.in"
        uuid = "11111111-1111-1111-1111-111111111005"
        plan = "Enterprise"
    }
)

$password = "Test@123"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Logging Service with Test Users" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test each user
foreach ($user in $testUsers) {
    Write-Host "Testing user: $($user.plan) - $($user.email)" -ForegroundColor Yellow
    
    # Login request
    $loginBody = @{
        email = $user.email
        password = $password
    } | ConvertTo-Json
    
    try {
        # Attempt login
        $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $loginBody `
            -ErrorAction Stop
        
        $responseData = $response.Content | ConvertFrom-Json
        
        Write-Host "  ✓ Login successful!" -ForegroundColor Green
        Write-Host "  User ID: $($responseData.user.id)" -ForegroundColor Gray
        
        # Extract access token
        $accessToken = $responseData.access_token
        
        # Make an authenticated request to test logging
        $headers = @{
            "Authorization" = "Bearer $accessToken"
        }
        
        # Get user workspace/profile (this should generate logs)
        try {
            $profileResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/users/me" `
                -Method GET `
                -Headers $headers `
                -ErrorAction Stop
            
            Write-Host "  ✓ Profile fetch successful!" -ForegroundColor Green
        }
        catch {
            Write-Host "  ✗ Profile fetch failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        Write-Host ""
        
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.Exception.Message
        
        Write-Host "  ✗ Login failed (Status: $statusCode)" -ForegroundColor Red
        Write-Host "  Error: $errorMessage" -ForegroundColor Red
        Write-Host ""
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Checking Loki Logs" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Query Loki for recent logs
try {
    $lokiUrl = "http://localhost:3100"
    $query = '{job="rawdrive"}'
    # Simple URL encoding for the query
    $encodedQuery = $query -replace '\{', '%7B' -replace '\}', '%7D' -replace '"', '%22'
    $lokiQueryUrl = "$lokiUrl/loki/api/v1/query_range?query=$encodedQuery&limit=100"
    
    Write-Host "Querying Loki for logs..." -ForegroundColor Gray
    
    $lokiResponse = Invoke-WebRequest -Uri $lokiQueryUrl -Method GET -ErrorAction Stop
    $lokiData = $lokiResponse.Content | ConvertFrom-Json
    
    if ($lokiData.data.result.Count -gt 0) {
        Write-Host "  ✓ Found $($lokiData.data.result.Count) log streams in Loki" -ForegroundColor Green
        
        # Display sample logs
        Write-Host "`nSample log entries:" -ForegroundColor Yellow
        $count = 0
        foreach ($stream in $lokiData.data.result) {
            foreach ($value in $stream.values) {
                if ($count -lt 10) {
                    $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$value[0] / 1000000).LocalDateTime
                    $message = $value[1]
                    Write-Host "  [$timestamp] $message" -ForegroundColor Gray
                    $count++
                }
            }
        }
    }
    else {
        Write-Host "  ⚠ No logs found in Loki" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  ✗ Failed to query Loki: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTest completed!" -ForegroundColor Cyan
