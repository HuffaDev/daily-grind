<#
.SYNOPSIS
Renders avatar.svg to avatar.png (1024×1024) with Microsoft Edge in headless mode, for the
Discord bot's avatar and the app icon, plus the 256×256 copies the website uses: the browser
tab icon (src/app/icon.png) and the logo on the hub page (public/daily-grind.png).
#>
$ErrorActionPreference = 'Stop'

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }

$svg = Join-Path $PSScriptRoot 'avatar.svg'
$png = Join-Path $PSScriptRoot 'avatar.png'
# A wrapper page with no margins, so the SVG fills the screenshot exactly
$page = Join-Path $env:TEMP 'daily-grind-avatar.html'
$svgUrl = ([Uri]$svg).AbsoluteUri
Set-Content -Path $page -Encoding utf8 -Value "<!doctype html><html><body style='margin:0'><img src='$svgUrl' width='1024' height='1024' style='display:block'></body></html>"

if (Test-Path $png) { Remove-Item $png }
# Edge reports progress on stderr, which PowerShell would otherwise treat as an error
$ErrorActionPreference = 'Continue'
& $edge --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files --window-size=1024,1024 "--screenshot=$png" ([Uri]$page).AbsoluteUri 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
for ($i = 0; $i -lt 20 -and -not (Test-Path $png); $i++) { Start-Sleep -Milliseconds 250 }
Remove-Item $page
if (-not (Test-Path $png)) { throw 'Edge did not produce a screenshot' }
Write-Host "Wrote $png"

Add-Type -AssemblyName System.Drawing
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$source = [System.Drawing.Image]::FromFile($png)
try {
    foreach ($target in 'src\app\icon.png', 'public\daily-grind.png') {
        $path = Join-Path $repo $target
        New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
        $small = New-Object System.Drawing.Bitmap 256, 256
        $g = [System.Drawing.Graphics]::FromImage($small)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($source, 0, 0, 256, 256)
        $g.Dispose()
        $small.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        $small.Dispose()
        Write-Host "Wrote $path"
    }
} finally {
    $source.Dispose()
}
