// Runtime-friendly helper that prefers Capacitor Geolocation (when the app runs on device)
// and falls back to browser navigator.geolocation. Uses only runtime checks so no Capacitor
// types or packages are required at compile time.

export async function obtainCurrentPosition(opts?: any): Promise<[number, number]> {
  // Try Capacitor Plugins if available at runtime (older/newer plugin attachment patterns)
  try {
    const win = window as any;
    if (win && win.Capacitor) {
      // Capacitor v3+ may expose Plugins on global, or plugins are attached differently depending on build
      const plugins = win.Capacitor.Plugins || win.Plugins || win.plugins || {};
      const Geolocation = plugins.Geolocation;
      // If plugin exposes requestPermissions/requestAuthorization, call it first so the runtime prompt appears
      try {
        if (Geolocation && typeof Geolocation.requestPermissions === 'function') {
          await Geolocation.requestPermissions();
        } else if (Geolocation && typeof Geolocation.requestAuthorization === 'function') {
          await Geolocation.requestAuthorization();
        }
      } catch (pmErr) {
        // ignore permission request errors, we'll try getCurrentPosition and surface an error to the caller
      }
      if (Geolocation && typeof Geolocation.getCurrentPosition === 'function') {
        const pos = await Geolocation.getCurrentPosition(opts || {});
        return [pos.coords.latitude, pos.coords.longitude];
      }
      // Some Capacitor setups attach the plugin directly under window.Geolocation
      if (win.Geolocation && typeof win.Geolocation.getCurrentPosition === 'function') {
        const pos = await win.Geolocation.getCurrentPosition(opts || {});
        return [pos.coords.latitude, pos.coords.longitude];
      }
    }
  } catch (e) {
    // ignore and fallback to navigator
  }

  // Fallback to browser geolocation API
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Tarayıcı konumunu desteklemiyor'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      (err) => {
        // Normalize permission denied to a friendly error with code
        if (err && (err.code === 1 || /permission/i.test(err.message || ''))) {
          const e: any = new Error('User denied Geolocation');
          e.code = 'PERMISSION_DENIED';
          return reject(e);
        }
        return reject(err);
      },
      opts || { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}
