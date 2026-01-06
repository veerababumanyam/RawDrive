# Add PORT_ONE_API_INTERNAL to .env file
# This script adds the missing port variable after PORT_ONE_API

$envFile = "c:\Users\admin\Desktop\RawDrive\.env"
$content = Get-Content $envFile -Raw

# Check if PORT_ONE_API_INTERNAL already exists
if ($content -notmatch "PORT_ONE_API_INTERNAL") {
    # Find the line with PORT_ONE_API and add PORT_ONE_API_INTERNAL after it
    $lines = Get-Content $envFile
    $newLines = @()
    
    foreach ($line in $lines) {
        $newLines += $line
        if ($line -match "^PORT_ONE_API=") {
            $newLines += "PORT_ONE_API_INTERNAL=3002"
        }
    }
    
    # Write back to file
    $newLines | Set-Content $envFile
    Write-Host "Added PORT_ONE_API_INTERNAL=3002 to .env file" -ForegroundColor Green
} else {
    Write-Host "PORT_ONE_API_INTERNAL already exists in .env file" -ForegroundColor Yellow
}
