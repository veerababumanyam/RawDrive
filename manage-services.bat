@echo off
REM ============================================
REM RawDrive - Service Management Commands
REM ============================================

if "%1"=="" goto help
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="status" goto status
if "%1"=="logs" goto logs
if "%1"=="help" goto help
goto help

:start
echo Starting all RawDrive services...
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d
goto status

:stop
echo Stopping all RawDrive services...
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env down
goto end

:restart
echo Restarting all RawDrive services...
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env restart
goto status

:status
echo.
echo Service Status:
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env ps
goto end

:logs
if "%2"=="" (
    echo Showing logs for all services (press Ctrl+C to exit)...
    docker compose -f infrastructure/docker/docker-compose.yml --env-file .env logs -f
) else (
    echo Showing logs for %2 (press Ctrl+C to exit)...
    docker compose -f infrastructure/docker/docker-compose.yml --env-file .env logs -f %2
)
goto end

:help
echo.
echo RawDrive Service Management
echo ===========================
echo.
echo Usage: manage-services.bat [command] [service]
echo.
echo Commands:
echo   start      - Start all services
echo   stop       - Stop all services
echo   restart    - Restart all services
echo   status     - Show service status
echo   logs       - Show logs (optionally for specific service)
echo   help       - Show this help
echo.
echo Examples:
echo   manage-services.bat start
echo   manage-services.bat status
echo   manage-services.bat logs gallery-service
echo.
echo Available Services:
echo   backend, gallery-service, billing-service, upload-service,
echo   onboarding-service, invitations-api, face-worker, content-worker,
echo   quality-worker, postgres, redis, traefik, prometheus, grafana
echo.
goto end

:end
