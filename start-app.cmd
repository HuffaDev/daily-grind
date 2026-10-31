@echo off
rem Double-clickable wrapper for start-app.ps1 (bypasses the PowerShell script policy for this run only)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1"
pause
