<#
.SYNOPSIS
Starts the Daily Grind dev server (http://localhost:3000) in the background, with the settings
from local.env (same names as .env.example). Logs go to dev.log next to this script.
Stop it with stop-app.ps1.
#>
$ErrorActionPreference = 'Stop'

$Port = 3000
$EnvFile = Join-Path $PSScriptRoot 'local.env'
$LogFile = Join-Path $PSScriptRoot 'dev.log'
$ErrorLogFile = Join-Path $PSScriptRoot 'dev-error.log'
$PidFile = Join-Path $PSScriptRoot '.dev-server.pid'

# Next.js startup failures, and Bun failing to run the script at all
$FailurePattern = '(?m)^\s*(Error:|error:|Failed to)|EADDRINUSE'

if (Test-Path $PidFile) {
    $existing = Get-Process -Id (Get-Content $PidFile) -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host 'Daily Grind is already running. Run .\stop-app.ps1 first.' -ForegroundColor Yellow
        exit 1
    }
    Remove-Item $PidFile
}

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Port $Port is already in use by another program." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile (see .env.example for the settings it needs)"
}

# KEY=VALUE lines; blank lines and # comments are skipped, surrounding quotes removed
$settings = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $settings[$Matches[1]] = $Matches[2] -replace '^"(.*)"$', '$1' -replace "^'(.*)'$", '$1'
    }
}

if (-not $settings['SESSION_SECRET']) {
    # Fine for local testing: players are signed in again after a restart
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $settings['SESSION_SECRET'] = [Convert]::ToBase64String($bytes)
    Write-Host 'No SESSION_SECRET in local.env; using a new random one for this run.'
}

foreach ($name in 'NEXT_PUBLIC_DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET') {
    if (-not $settings[$name]) {
        Write-Host "local.env has no $name; the Discord sign-in won't work." -ForegroundColor Yellow
    }
}

# Inherited by the server started below
foreach ($name in $settings.Keys) {
    Set-Item -Path "Env:$name" -Value $settings[$name]
}
$env:NO_COLOR = '1'
$env:PORT = "$Port"

foreach ($file in $LogFile, $ErrorLogFile) {
    if (Test-Path $file) {
        Remove-Item $file
    }
}

Write-Host 'Starting Daily Grind...'
$server = Start-Process -FilePath 'bun' -ArgumentList 'run', 'dev' -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $LogFile -RedirectStandardError $ErrorLogFile -WindowStyle Hidden -PassThru
Set-Content -Path $PidFile -Value $server.Id

$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $log = (Get-Content $LogFile -Raw -ErrorAction SilentlyContinue) + (Get-Content $ErrorLogFile -Raw -ErrorAction SilentlyContinue)

    if ($server.HasExited -or $log -cmatch $FailurePattern) {
        Write-Host 'Startup failed. Last log lines:' -ForegroundColor Red
        Get-Content $LogFile, $ErrorLogFile -Tail 15 -ErrorAction SilentlyContinue
        & (Join-Path $PSScriptRoot 'stop-app.ps1') | Out-Null
        exit 1
    }

    if ($log -match 'Ready in') {
        Write-Host 'Daily Grind is running.' -ForegroundColor Green
        Write-Host "  Website: http://localhost:$Port"
        Write-Host "  Logs:    $LogFile"
        Write-Host '           (follow live with: Get-Content .\dev.log -Wait)'
        Write-Host '  Stop:    .\stop-app.ps1'
        exit 0
    }
}

Write-Host "Timed out waiting for startup. Check $LogFile" -ForegroundColor Yellow
exit 1
