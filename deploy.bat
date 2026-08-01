@echo off
rem Double-clickable launcher for deploy.ps1 (Windows).
rem Passes any arguments through, e.g.:  deploy.bat -Dev
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
pause
