@echo off
cd /d "%~dp0"
python --version >nul 2>&1
if not errorlevel 1 (
    python "%~dp0server.py"
    goto end
)
py -3 --version >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0server.py"
    goto end
)
echo Python 3 was not found. Please install Python 3 and try again.
pause
exit /b 1
:end
if errorlevel 1 (
    echo The game could not start. Please show this window to Codex.
    pause
)
