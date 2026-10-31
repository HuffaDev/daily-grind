<#
.SYNOPSIS
Stops the Daily Grind dev server started by start-app.ps1.
#>
$Port = 3000
$PidFile = Join-Path $PSScriptRoot '.dev-server.pid'

function Get-Listener {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

$serverPid = if (Test-Path $PidFile) { Get-Content $PidFile } else { $null }
$server = if ($serverPid) { Get-Process -Id $serverPid -ErrorAction SilentlyContinue } else { $null }

if (-not $server) {
    if (Test-Path $PidFile) {
        Remove-Item $PidFile
    }
    $listener = Get-Listener
    if ($listener) {
        $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "Daily Grind is not running, but port $Port is in use by $($owner.ProcessName) (PID $($listener.OwningProcess))." -ForegroundColor Yellow
    } else {
        Write-Host 'Daily Grind is not running.'
    }
    exit 0
}

Write-Host 'Stopping Daily Grind...'
# Bun starts Next.js, which starts its own workers; /T stops the whole tree
taskkill /PID $serverPid /T /F | Out-Null

for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-Process -Id $serverPid -ErrorAction SilentlyContinue) -and -not (Get-Listener)) {
        Remove-Item $PidFile
        Write-Host 'Daily Grind stopped.' -ForegroundColor Green
        exit 0
    }
}

Write-Host "Could not stop every process. Check: Get-NetTCPConnection -LocalPort $Port" -ForegroundColor Red
exit 1
