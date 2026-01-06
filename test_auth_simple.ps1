# Simple authentication test for test users
$baseUrl = "http://localhost:8000"
$password = "Test@123"

$testUsers = @(
    "free@test.rawdrive.in",
    "starter@test.rawdrive.in",
    "professional@test.rawdrive.in",
    "business@test.rawdrive.in",
    "enterprise@test.rawdrive.in"
)

Write-Host "Testing Authentication for Test Users" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

foreach ($email in $testUsers) {
    Write-Host "Testing: $email" -ForegroundColor Yellow
    
    $body = @{
        email = $email
        password = $password
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/login" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body

        Write-Host "  SUCCESS - User ID: $($response.user.id)" -ForegroundColor Green
        Write-Host "  Token: $($response.access_token.Substring(0, 20))..." -ForegroundColor Gray
    }
    catch {
        Write-Host "  FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "Test Complete!" -ForegroundColor Cyan
