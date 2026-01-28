param(
  [switch]$AllowLocalApiBaseUrl
)

$ErrorActionPreference = 'Stop'

function Read-AndroidVersion {
  param([string]$GradleFile)
  $raw = Get-Content -Raw -Path $GradleFile
  $vc = [regex]::Match($raw, 'versionCode\s+(\d+)')
  $vn = [regex]::Match($raw, 'versionName\s+"([^"]+)"')
  if (-not $vc.Success -or -not $vn.Success) {
    return @{ versionCode = 'unknown'; versionName = 'unknown' }
  }
  return @{ versionCode = $vc.Groups[1].Value; versionName = $vn.Groups[1].Value }
}

Write-Host "Building web assets (release)..." -ForegroundColor Cyan
if ($AllowLocalApiBaseUrl) {
  $env:ALLOW_LOCAL_API_BASE_URL = '1'
}

npm run build

Write-Host "`nSyncing Capacitor Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host "`nBuilding release AAB (signed if keystore configured)..." -ForegroundColor Cyan
Push-Location android
.\gradlew.bat bundleRelease --no-daemon
Pop-Location

$aabPath = Join-Path $PSScriptRoot '..\android\app\build\outputs\bundle\release\app-release.aab'
if (-not (Test-Path $aabPath)) {
  throw "AAB not found at $aabPath"
}

$ver = Read-AndroidVersion -GradleFile (Join-Path $PSScriptRoot '..\android\app\build.gradle')
$destName = "mapflow-v$($ver.versionName)-vc$($ver.versionCode)-release.aab"
$destPath = Join-Path $PSScriptRoot "..\$destName"

Copy-Item -Path $aabPath -Destination $destPath -Force

Write-Host "`n✅ AAB created: $destName" -ForegroundColor Green
Write-Host "Source: $aabPath" -ForegroundColor DarkGray
Write-Host "Dest:   $destPath" -ForegroundColor Yellow

Write-Host "`nNOTE: Google Play requires a SIGNED release bundle." -ForegroundColor DarkYellow
Write-Host "- Signing config is read from android/gradle.properties (RELEASE_* keys)." -ForegroundColor DarkYellow
