# PowerShell test script for client activities and communications endpoints

# Configuration
$BASE_URL = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost" }
$WORKSPACE_ID = if ($env:WORKSPACE_ID) { $env:WORKSPACE_ID } else { "11111111-1111-1111-1111-000000000003" }
$CLIENT_ID = if ($env:CLIENT_ID) { $env:CLIENT_ID } else { "bbcb9575-788c-4f52-b7c2-8a609cc11d8a" }
$TOKEN = if ($env:TOKEN) { $env:TOKEN } else { "" }

# Professional test user credentials
$TEST_EMAIL = "professional@test.rawdrive.in"
$TEST_PASSWORD = "Test@123"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Testing Client Activities & Communications" -ForegroundColor Cyan
Write-Host "=========================================="
Write-Host ""

# Auto-login if token not provided
if ([string]::IsNullOrEmpty($TOKEN)) {
    Write-Host "Token not provided. Attempting to login with professional test user..." -ForegroundColor Yellow
    Write-Host "Email: $TEST_EMAIL" -ForegroundColor Gray
    Write-Host ""
    
    try {
        $loginPayload = @{
            email = $TEST_EMAIL
            password = $TEST_PASSWORD
            workspace_id = $WORKSPACE_ID
        } | ConvertTo-Json
        
        $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/v1/auth/login" `
            -Method Post `
            -Headers @{ "Content-Type" = "application/json" } `
            -Body $loginPayload `
            -ErrorAction Stop
        
        # Extract token from response
        if ($loginResponse.tokens) {
            if ($loginResponse.tokens.access_token) {
                $TOKEN = $loginResponse.tokens.access_token
            } elseif ($loginResponse.tokens.PSObject.Properties['access_token']) {
                $TOKEN = $loginResponse.tokens.PSObject.Properties['access_token'].Value
            }
        } elseif ($loginResponse.access_token) {
            $TOKEN = $loginResponse.access_token
        }
        
        if ($TOKEN) {
            Write-Host "✓ Login successful! Token obtained." -ForegroundColor Green
            Write-Host ""
        } else {
            Write-Host "✗ Login failed: Token not found in response" -ForegroundColor Red
            Write-Host "Response: $($loginResponse | ConvertTo-Json -Depth 5)" -ForegroundColor Gray
            exit 1
        }
    } catch {
        Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Gray
        }
        Write-Host ""
        Write-Host "Please set TOKEN manually:" -ForegroundColor Yellow
        Write-Host '$env:TOKEN = "your-jwt-token"' -ForegroundColor Yellow
        exit 1
    }
}

# Test 1: Record Activity
Write-Host "Test 1: Record Activity" -ForegroundColor Yellow
$activityPayload = @{
    activity_type = "note"
    title = "Test Activity"
    description = "This is a test activity created via script"
    metadata = @{
        activity_date = "2026-01-09"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Payload: $activityPayload"
Write-Host ""

try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    if (-not [string]::IsNullOrEmpty($TOKEN)) {
        $headers["Authorization"] = "Bearer $TOKEN"
    }
    
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/activities" `
        -Method Post `
        -Headers $headers `
        -Body $activityPayload `
        -ErrorAction Stop
    
    $statusCode = $response.StatusCode
    $responseBody = $response.Content | ConvertFrom-Json
    
    Write-Host "✓ Activity recorded successfully (HTTP $statusCode)" -ForegroundColor Green
    Write-Host "Response: $($responseBody | ConvertTo-Json -Depth 10)"
} catch {
    Write-Host "✗ Failed to record activity" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP Status: $statusCode" -ForegroundColor Yellow
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}
Write-Host ""

# Test 2: Log Communication
Write-Host "Test 2: Log Communication" -ForegroundColor Yellow
$commPayload = @{
    communication_type = "email"
    direction = "outbound"
    subject = "Test Communication"
    notes = "This is a test communication logged via script"
    follow_up_required = $false
} | ConvertTo-Json

Write-Host "Payload: $commPayload"
Write-Host ""

try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    if (-not [string]::IsNullOrEmpty($TOKEN)) {
        $headers["Authorization"] = "Bearer $TOKEN"
    }
    
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/communications" `
        -Method Post `
        -Headers $headers `
        -Body $commPayload `
        -ErrorAction Stop
    
    $statusCode = $response.StatusCode
    $responseBody = $response.Content | ConvertFrom-Json
    
    Write-Host "✓ Communication logged successfully (HTTP $statusCode)" -ForegroundColor Green
    Write-Host "Response: $($responseBody | ConvertTo-Json -Depth 10)"
} catch {
    Write-Host "✗ Failed to log communication" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}
Write-Host ""

# Test 3: Get Activities
Write-Host "Test 3: Get Activities" -ForegroundColor Yellow
try {
    $headers = @{}
    if (-not [string]::IsNullOrEmpty($TOKEN)) {
        $headers["Authorization"] = "Bearer $TOKEN"
    }
    
    $activitiesUrl = "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/activities" + '?page=1&limit=10'
    $response = Invoke-WebRequest -Uri $activitiesUrl `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    $statusCode = $response.StatusCode
    $responseBody = $response.Content | ConvertFrom-Json
    
    Write-Host "✓ Activities retrieved successfully (HTTP $statusCode)" -ForegroundColor Green
    Write-Host "Response structure: $($responseBody.PSObject.Properties.Name -join ', ')"
} catch {
    Write-Host "✗ Failed to get activities" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 4: Get Communications
Write-Host "Test 4: Get Communications" -ForegroundColor Yellow
try {
    $headers = @{}
    if (-not [string]::IsNullOrEmpty($TOKEN)) {
        $headers["Authorization"] = "Bearer $TOKEN"
    }
    
    $communicationsUrl = "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/communications" + '?page=1&limit=10'
    $response = Invoke-WebRequest -Uri $communicationsUrl `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    $statusCode = $response.StatusCode
    $responseBody = $response.Content | ConvertFrom-Json
    
    Write-Host "✓ Communications retrieved successfully (HTTP $statusCode)" -ForegroundColor Green
    Write-Host "Response structure: $($responseBody.PSObject.Properties.Name -join ', ')"
} catch {
    Write-Host "✗ Failed to get communications" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Tests completed" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
