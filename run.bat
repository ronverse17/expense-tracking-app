@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
    py -3.11 --version >nul 2>nul
    if not errorlevel 1 (
        py -3.11 server.py
        goto end
    )
)
where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; raise SystemExit(sys.version_info < (3, 11))" >nul 2>nul
    if not errorlevel 1 (
        python server.py
        goto end
    )
)
echo Python 3.11 or newer is required to run Paisa.
echo Install Python from https://www.python.org/downloads/ and then run this file again.
:end
pause
