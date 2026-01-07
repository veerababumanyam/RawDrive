# Test Face Groups Endpoint with Business User

# Login as business user
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"business@test.rawdrive.in","password":"Test@123"}'

$token = $loginResponse.tokens.access_token
$workspaceId = $loginResponse.user.workspace_id

Write-Host "Business user workspace_id: $workspaceId" -ForegroundColor Green
Write-Host "Testing GET /api/v1/workspaces/$workspaceId/face-groups" -ForegroundColor Cyan

# Try to get face groups
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/workspaces/$workspaceId/face-groups?min_faces=1&limit=100&page=1" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }

    Write-Host "SUCCESS - Face groups endpoint accessible!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "ERROR - Failed to access face-groups" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    $errorBody = $_.ErrorDetails.Message
    Write-Host "Error Body: $errorBody" -ForegroundColor Yellow
}
