export type WeatherSnapshot = {
  latitude: number;
  longitude: number;
  temperatureC: number;
  windSpeedKmh: number;
  weatherCode: number;
  observedAtIso: string;
};

const CACHE_PREFIX = 'weather_cache_v1:';

const nowMs = () => Date.now();

export const weatherCodeToTr = (code: number): string => {
  // Open-Meteo weather codes: https://open-meteo.com/en/docs
  if (code === 0) return 'Açık';
  if (code === 1) return 'Az bulutlu';
  if (code === 2) return 'Parçalı bulutlu';
  if (code === 3) return 'Çok bulutlu';
  if (code === 45 || code === 48) return 'Sisli';
  if (code >= 51 && code <= 57) return 'Çiseleme';
  if (code >= 61 && code <= 67) return 'Yağmurlu';
  if (code >= 71 && code <= 77) return 'Karlı';
  if (code >= 80 && code <= 82) return 'Sağanak';
  if (code >= 85 && code <= 86) return 'Kar sağanağı';
  if (code >= 95 && code <= 99) return 'Gök gürültülü';
  return 'Bilinmiyor';
};

export async function geocodeCityInTurkey(
  cityName: string,
  signal?: AbortSignal
): Promise<{ latitude: number; longitude: number; resolvedName: string } | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', cityName);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'tr');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  if (!results.length) return null;

  const tr = results.find(r => String(r?.country_code || '').toUpperCase() === 'TR') ?? results[0];
  const latitude = Number(tr?.latitude);
  const longitude = Number(tr?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const resolvedName = String(tr?.name || cityName);
  return { latitude, longitude, resolvedName };
}

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<WeatherSnapshot | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const cur = json?.current;

  const temperatureC = Number(cur?.temperature_2m);
  const windSpeedKmh = Number(cur?.wind_speed_10m);
  const weatherCode = Number(cur?.weather_code);
  const observedAtIso = String(cur?.time || new Date().toISOString());

  if (!Number.isFinite(temperatureC) || !Number.isFinite(windSpeedKmh) || !Number.isFinite(weatherCode)) return null;

  return {
    latitude,
    longitude,
    temperatureC,
    windSpeedKmh,
    weatherCode,
    observedAtIso,
  };
}

export function readWeatherCache(key: string, maxAgeMs: number): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: WeatherSnapshot };
    if (!parsed?.ts || !parsed?.data) return null;
    if (nowMs() - Number(parsed.ts) > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeWeatherCache(key: string, data: WeatherSnapshot): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: nowMs(), data }));
  } catch {
    // ignore
  }
}
