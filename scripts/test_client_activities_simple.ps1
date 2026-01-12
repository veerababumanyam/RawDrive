# Simple PowerShell test script for client activities

$BASE_URL = "http://localhost"
$WORKSPACE_ID = "11111111-1111-1111-1111-000000000003"
$CLIENT_ID = "bbcb9575-788c-4f52-b7c2-8a609cc11d8a"
$TEST_EMAIL = "professional@test.rawdrive.in"
$TEST_PASSWORD = "Test@123"

Write-Host "Testing Client Activities & Communications" -ForegroundColor Cyan
Write-Host ""

# Login
Write-Host "Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = $TEST_EMAIL
    password = $TEST_PASSWORD
    workspace_id = $WORKSPACE_ID
} | ConvertTo-Json

try {
    $loginResp = Invoke-RestMethod -Uri "$BASE_URL/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $TOKEN = $loginResp.tokens.access_token
    Write-Host "Login successful!" -ForegroundColor Green
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Record Activity
Write-Host "Recording Activity..." -ForegroundColor Yellow
$activityBody = @{
    activity_type = "note"
    title = "Test Activity"
    description = "Test activity from script"
} | ConvertTo-Json

try {
    $activityResp = Invoke-RestMethod -Uri "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/activities" `
        -Method Post `
        -Headers @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
        -Body $activityBody
    Write-Host "Activity recorded successfully!" -ForegroundColor Green
    Write-Host "Response: $($activityResp | ConvertTo-Json)"
} catch {
    Write-Host "Failed to record activity: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Log Communication
Write-Host "Logging Communication..." -ForegroundColor Yellow
$commBody = @{
    communication_type = "email"
    direction = "outbound"
    subject = "Test Communication"
    notes = "Test communication from script"
    follow_up_required = $false
} | ConvertTo-Json

try {
    $commResp = Invoke-RestMethod -Uri "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/communications" `
        -Method Post `
        -Headers @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
        -Body $commBody
    Write-Host "Communication logged successfully!" -ForegroundColor Green
    Write-Host "Response: $($commResp | ConvertTo-Json)"
} catch {
    Write-Host "Failed to log communication: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Get Activities
Write-Host "Getting Activities..." -ForegroundColor Yellow
try {
    $getActivitiesResp = Invoke-RestMethod -Uri "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/activities?page=1&limit=10" `
        -Method Get `
        -Headers @{ "Authorization" = "Bearer $TOKEN" }
    Write-Host "Activities retrieved successfully!" -ForegroundColor Green
    Write-Host "Response keys: $($getActivitiesResp.PSObject.Properties.Name -join ', ')"
} catch {
    Write-Host "Failed to get activities: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Get Communications
Write-Host "Getting Communications..." -ForegroundColor Yellow
try {
    $getCommResp = Invoke-RestMethod -Uri "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/communications?page=1&limit=10" `
        -Method Get `
        -Headers @{ "Authorization" = "Bearer $TOKEN" }
    Write-Host "Communications retrieved successfully!" -ForegroundColor Green
    Write-Host "Response keys: $($getCommResp.PSObject.Properties.Name -join ', ')"
} catch {
    Write-Host "Failed to get communications: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "Tests completed!" -ForegroundColor Cyan
