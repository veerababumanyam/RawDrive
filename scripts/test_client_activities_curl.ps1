# PowerShell test script using curl for client activities and communications

# Configuration
$BASE_URL = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost" }
$WORKSPACE_ID = if ($env:WORKSPACE_ID) { $env:WORKSPACE_ID } else { "11111111-1111-1111-1111-000000000003" }
$CLIENT_ID = if ($env:CLIENT_ID) { $env:CLIENT_ID } else { "bbcb9575-788c-4f52-b7c2-8a609cc11d8a" }

# Professional test user credentials
$TEST_EMAIL = "professional@test.rawdrive.in"
$TEST_PASSWORD = "Test@123"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Testing Client Activities & Communications" -ForegroundColor Cyan
Write-Host "=========================================="
Write-Host ""

# Step 1: Login and get token
Write-Host "Step 1: Logging in..." -ForegroundColor Yellow
$loginJson = (@{
    email = $TEST_EMAIL
    password = $TEST_PASSWORD
    workspace_id = $WORKSPACE_ID
} | ConvertTo-Json -Compress)

$loginResponse = curl.exe -s -X POST "$BASE_URL/api/v1/auth/login" `
    -H "Content-Type: application/json" `
    -d $loginJson

$loginData = $loginResponse | ConvertFrom-Json
$TOKEN = $loginData.tokens.access_token

if (-not $TOKEN) {
    Write-Host "Failed to get token from login response" -ForegroundColor Red
    Write-Host "Response: $loginResponse" -ForegroundColor Gray
    exit 1
}

Write-Host "Login successful!" -ForegroundColor Green
Write-Host ""

# Step 2: Record Activity
Write-Host "Step 2: Recording Activity..." -ForegroundColor Yellow
$activityJson = (@{
    activity_type = "note"
    title = "Test Activity from Script"
    description = "This is a test activity created via curl script"
    metadata = @{
        activity_date = "2026-01-09"
    }
} | ConvertTo-Json -Depth 10 -Compress)

$activityResponse = curl.exe -s -w "`n%{http_code}" -X POST "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/activities" `
    -H "Content-Type: application/json" `
    -H "Authorization: Bearer $TOKEN" `
    -d $activityJson

$activityLines = $activityResponse -split "`n"
$activityHttpCode = $activityLines[-1]
$activityBody = ($activityLines[0..($activityLines.Length-2)] -join "`n")

if ($activityHttpCode -eq "201" -or $activityHttpCode -eq "200") {
    Write-Host "Activity recorded successfully (HTTP $activityHttpCode)" -ForegroundColor Green
    Write-Host "Response: $activityBody"
} else {
    Write-Host "Failed to record activity (HTTP $activityHttpCode)" -ForegroundColor Red
    Write-Host "Response: $activityBody"
}
Write-Host ""

# Step 3: Log Communication
Write-Host "Step 3: Logging Communication..." -ForegroundColor Yellow
$commJson = (@{
    communication_type = "email"
    direction = "outbound"
    subject = "Test Communication from Script"
    notes = "This is a test communication logged via curl script"
    follow_up_required = $false
} | ConvertTo-Json -Compress)

$commResponse = curl.exe -s -w "`n%{http_code}" -X POST "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/communications" `
    -H "Content-Type: application/json" `
    -H "Authorization: Bearer $TOKEN" `
    -d $commJson

$commLines = $commResponse -split "`n"
$commHttpCode = $commLines[-1]
$commBody = ($commLines[0..($commLines.Length-2)] -join "`n")

if ($commHttpCode -eq "201" -or $commHttpCode -eq "200") {
    Write-Host "Communication logged successfully (HTTP $commHttpCode)" -ForegroundColor Green
    Write-Host "Response: $commBody"
} else {
    Write-Host "Failed to log communication (HTTP $commHttpCode)" -ForegroundColor Red
    Write-Host "Response: $commBody"
}
Write-Host ""

# Step 4: Get Activities
Write-Host "Step 4: Getting Activities..." -ForegroundColor Yellow
$getActivitiesResponse = curl.exe -s -w "`n%{http_code}" -X GET "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/activities?page=1&limit=10" `
    -H "Authorization: Bearer $TOKEN"

$activitiesLines = $getActivitiesResponse -split "`n"
$activitiesHttpCode = $activitiesLines[-1]
$activitiesBody = ($activitiesLines[0..($activitiesLines.Length-2)] -join "`n")

if ($activitiesHttpCode -eq "200") {
    Write-Host "Activities retrieved successfully (HTTP $activitiesHttpCode)" -ForegroundColor Green
    $activitiesData = $activitiesBody | ConvertFrom-Json
    Write-Host "Response keys: $($activitiesData.PSObject.Properties.Name -join ', ')"
} else {
    Write-Host "Failed to get activities (HTTP $activitiesHttpCode)" -ForegroundColor Red
    Write-Host "Response: $activitiesBody"
}
Write-Host ""

# Step 5: Get Communications
Write-Host "Step 5: Getting Communications..." -ForegroundColor Yellow
$getCommResponse = curl.exe -s -w "`n%{http_code}" -X GET "$BASE_URL/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/communications?page=1&limit=10" `
    -H "Authorization: Bearer $TOKEN"

$getCommLines = $getCommResponse -split "`n"
$getCommHttpCode = $getCommLines[-1]
$getCommBody = ($getCommLines[0..($getCommLines.Length-2)] -join "`n")

if ($getCommHttpCode -eq "200") {
    Write-Host "Communications retrieved successfully (HTTP $getCommHttpCode)" -ForegroundColor Green
    $commData = $getCommBody | ConvertFrom-Json
    Write-Host "Response keys: $($commData.PSObject.Properties.Name -join ', ')"
} else {
    Write-Host "Failed to get communications (HTTP $getCommHttpCode)" -ForegroundColor Red
    Write-Host "Response: $getCommBody"
}
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Tests completed" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
