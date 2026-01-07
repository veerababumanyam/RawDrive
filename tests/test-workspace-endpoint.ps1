# Test Workspace Endpoint

# Login and get token
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"free@test.rawdrive.in","password":"Test@123"}'

$token = $loginResponse.tokens.access_token
$workspaceId = $loginResponse.user.workspace_id

Write-Host "User workspace_id: $workspaceId" -ForegroundColor Green
Write-Host "Testing GET /api/v1/workspaces/$workspaceId" -ForegroundColor Cyan

# Try to get workspace
try {
    $workspaceResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/workspaces/$workspaceId" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }

    Write-Host "SUCCESS - Workspace found!" -ForegroundColor Green
    $workspaceResponse | ConvertTo-Json -Depth 5
} catch {
    Write-Host "ERROR - Failed to get workspace" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    $errorBody = $_.ErrorDetails.Message
    Write-Host "Error Body: $errorBody" -ForegroundColor Yellow
}
