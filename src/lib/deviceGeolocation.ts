// Runtime-friendly helper: sadece browser `navigator.geolocation` kullanır.
// Böylece Capacitor Geolocation plugin'i hiç çağrılmaz, izin diyaloğu tek kanaldan gelir.

export async function obtainCurrentPosition(opts?: any): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const e: any = new Error('Tarayıcı konumunu desteklemiyor');
      e.code = 'NOT_SUPPORTED';
      return reject(e);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        if (err && (err.code === 1 || /permission/i.test(err.message || ''))) {
          const e: any = new Error('Konum izni reddedildi');
          e.code = 'PERMISSION_DENIED';
          return reject(e);
        }
        const e: any = new Error('Konum alınamadı');
        e.code = 'POSITION_UNAVAILABLE';
        return reject(e);
      },
      opts || { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}
