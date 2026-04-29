@echo off
title BodaIntel Platform
color 0E

echo.
echo   =========================================================
echo     BodaIntel Platform :: Fleet Intelligence for Kampala
echo   =========================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Python not found.
    echo   Please install Python 3.9+ from https://python.org
    echo   Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo   [OK] Python found
echo   [..] Installing dependencies...
echo.

cd backend
pip install -r requirements.txt --quiet

echo.
echo   [OK] Dependencies ready
echo   [>>] Starting server on http://localhost:8000
echo   [>>] API Docs: http://localhost:8000/api/docs
echo.
echo   Press Ctrl+C to stop the server.
echo.

python main.py
pause
