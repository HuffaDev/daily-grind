@echo off
rem Double-clickable wrapper for stop-app.ps1 (bypasses the PowerShell script policy for this run only)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-app.ps1"
pause
