@echo off
echo ============================================================
echo    RawDrive Backend - Verify Import Fix
echo ============================================================
echo.

echo [1] Restarting backend with fixed imports...
docker restart rawdrive-backend
if %ERRORLEVEL% NEQ 0 (
    echo [FAIL] Could not restart backend
    pause
    exit /b 1
)

echo [OK] Backend restart initiated
echo.
echo [2] Waiting 15 seconds for backend to start...
timeout /t 15 /nobreak

echo.
echo [3] Checking backend health...
curl -s -o nul -w "%%{http_code}" http://localhost/health/live
echo.

echo [4] Checking backend logs for errors...
docker logs --tail 20 rawdrive-backend 2>&1 | findstr /i "error import trace"

echo.
echo ============================================================
echo    If you see "200" above, the backend is healthy!
echo    If you see import errors, the fix may not have applied.
echo ============================================================
pause
