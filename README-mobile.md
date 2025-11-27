Capacitor packaging for Android/iOS

Quick steps:

1. Install Capacitor deps:
   npm install @capacitor/core @capacitor/cli --save-dev

2. Initialize Capacitor (run once):
   npx cap init "101-104 Nelit" com.nelit.project101104 --web-dir=dist

3. Build the web app:
   npm run build

4. Add a platform:
   npx cap add android
   npx cap add ios   # macOS only, requires Xcode

5. Sync web assets and open the native project:
   npx cap copy
   npx cap open android
   npx cap open ios

Notes:
- For location permissions and geolocation to work, ensure AndroidManifest and Info.plist have the proper keys.
- iOS build requires a Mac with Xcode. Android builds can be done on Windows with Android Studio.
- After making web changes, run `npm run build` then `npx cap copy` to update native projects.
