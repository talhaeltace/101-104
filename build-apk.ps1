# Build and create APK
Write-Host "Building web assets..." -ForegroundColor Cyan
npm run build

Write-Host "`nSyncing to Android..." -ForegroundColor Cyan
npx cap sync android

Write-Host "`nBuilding APK..." -ForegroundColor Cyan
cd android
.\gradlew assembleDebug --no-daemon

Write-Host "`n✅ APK built successfully!" -ForegroundColor Green
Write-Host "Location: android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Yellow

# Copy to project root for easy access
Write-Host "`nCopying APK to project root..." -ForegroundColor Cyan
Copy-Item -Path "app\build\outputs\apk\debug\app-debug.apk" -Destination "..\app-debug.apk" -Force
Write-Host "✅ APK copied to: app-debug.apk" -ForegroundColor Green
