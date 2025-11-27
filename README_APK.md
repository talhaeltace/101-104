# APK build & packaging notes (Windows / PowerShell)

This file explains how to create a production APK from this Vite + React + Capacitor project and common gotchas I checked for.

Prerequisites
- Node 18+ installed and on PATH
- Java JDK 17+ installed (match Android Gradle Plugin requirements)
- Android SDK + Android Studio (or at least command-line SDK + Gradle)
- Capacitor CLI available (`npm install --save-dev @capacitor/cli` if not already)

Quick checklist I verified in this repo
- `capacitor.config.json` exists and `webDir` is `dist` (matches Vite build output). ✓
- No `server.url` entry (dev-only live-reload) in `capacitor.config.json`. ✓
- Android native project present under `android/` with launcher icons & splash images. ✓
- `AndroidManifest.xml` includes INTERNET and location permissions; `activity` includes many `configChanges` so rotation won't recreate activity (keeps WebView layout stable). ✓
- Map resizing: App sets CSS `--vh` variable and `MapComponent` calls `invalidateSize()` on resize/orientation change to avoid clipped map. ✓

Recommended APK build steps (PowerShell commands)

1) Create an optimized web build
```powershell
npm run build
```

2) Copy web assets into native projects
```powershell
npx cap copy android
```

3) Open Android Studio (recommended) to build signed APK / App Bundle
```powershell
npx cap open android
```

4) In Android Studio
- Set a release signing config (keystore) under `Build > Generate Signed Bundle / APK...`.
- Prefer building an AAB for Play Store distribution.
- Check `android:exported` warnings and adjust manifest if Android Studio prompts.

Common issues & fixes
- Problem: WebView shows a blank/white screen on native device after installing APK.
  - Fixes to try: ensure `capacitor.config.json` does not have `server.url` (dev live-reload); run `npx cap copy` after `npm run build`; check Android logcat for errors; enable dev overlay by setting WebView debugging in `MainActivity`.
- Problem: Map clipped after rotation.
  - Fix: The app already sets `--vh` and calls `invalidateSize()` on resize/orientation. If you still see clipping, open the WebView console (adb logcat or Chrome remote debugging) and call `map.invalidateSize()` manually as a test.
- Problem: Build fails with Gradle / Java errors.
  - Ensure Java JDK 17 is installed and ANDROID_HOME / ANDROID_SDK_ROOT env vars point to SDK. Use Gradle wrapper in `android/gradlew`.

Optional: Building from CLI (no Android Studio)
- You can build from command line using Gradle wrapper:
```powershell
cd android
./gradlew assembleRelease
```
On Windows PowerShell use `gradlew.bat assembleRelease`.

Next steps I can take for you
- Create a sample signed debug keystore and produce an unsigned APK for quick testing (you'll need to test on a device/emulator). I can add scripts to `package.json` to run the full flow.
- Run a local emulator build here if you want; note: this environment may not have Android SDK/JDK configured.

If you want, I'll now:
- add a helpful `package.json` script for `build:android` that runs `npm run build && npx cap copy android` and optionally opens Android Studio,
- or create a sample `keystore` and a `gradle` signing config for local debug builds (you'll choose whether to commit the keystore).

Tell me which of those you'd like me to do next and I'll apply the change.