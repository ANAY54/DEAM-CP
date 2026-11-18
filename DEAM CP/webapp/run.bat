@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo Node.js/npm was not found on this machine.
    echo Install it from https://nodejs.org ^(LTS version^), then run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies, this only happens once...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. See the output above.
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed, skipping npm install.
)

echo.
echo Starting the Smart Doorbell dashboard...
start "" cmd /c "timeout /t 3 >nul && start "" http://localhost:5173"
call npm run dev

pause
