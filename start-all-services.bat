@echo off
REM ============================================
REM RawDrive - Start All Microservices
REM ============================================
echo.
echo Starting RawDrive Microservices...
echo.

cd /d "%~dp0"

docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ All services started successfully!
    echo.
    echo Auto-restart is ENABLED - services will start automatically when Docker Desktop starts
    echo.
    echo Service Status:
    docker compose -f infrastructure/docker/docker-compose.yml ps
    echo.
) else (
    echo.
    echo ✗ Failed to start services!
    echo Check the error messages above
    exit /b 1
)
