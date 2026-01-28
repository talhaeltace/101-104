import React from 'react';
import { Cloud, CloudRain, CloudSun, Wind } from 'lucide-react';
import type { Region, Location } from '../data/regions';
import {
  fetchCurrentWeather,
  geocodeCityInTurkey,
  readWeatherCache,
  weatherCodeToTr,
  writeWeatherCache,
  type WeatherSnapshot,
} from '../lib/weather';

type WeatherWidgetProps = {
  selectedRegion: number;
  regions: Region[];
  variant?: 'card' | 'inline';
};

const REGION_CITY: Record<number, string> = {
  1: 'İstanbul',
  2: 'Bursa',
  3: 'İzmir',
  4: 'İstanbul',
  5: 'Sakarya',
  6: 'Kütahya',
  7: 'Isparta',
  8: 'Ankara',
  9: 'Konya',
  10: 'Samsun',
  11: 'Kayseri',
  12: 'Gaziantep',
  13: 'Elazığ',
  14: 'Trabzon',
  15: 'Erzurum',
  16: 'Batman',
  17: 'Van',
  18: 'Adana',
  19: 'Antalya',
  20: 'Edirne',
  21: 'Denizli',
  22: 'Kastamonu',
};

const normalizeDirectorateField = (value: unknown) => String(value ?? '').trim().toUpperCase();
const isDirectorateLocation = (loc: Location) =>
  normalizeDirectorateField((loc as any).brand) === 'BÖLGE' &&
  normalizeDirectorateField((loc as any).model) === 'MÜDÜRLÜK';

const iconForCode = (code: number) => {
  if (code === 0) return CloudSun;
  if (code >= 1 && code <= 3) return Cloud;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return CloudRain;
  return Cloud;
};

export default function WeatherWidget({ selectedRegion, regions, variant = 'card' }: WeatherWidgetProps) {
  const [snapshot, setSnapshot] = React.useState<WeatherSnapshot | null>(null);
  const [label, setLabel] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    const run = async () => {
      setLoading(true);

      const isAll = selectedRegion === 0;
      const regionCity = !isAll ? (REGION_CITY[selectedRegion] ?? `Bölge ${selectedRegion}`) : '';
      const displayLabel: string = isAll ? 'Türkiye Geneli' : String(regionCity);
      if (alive) setLabel(displayLabel);

      const cacheKey = isAll ? 'TR:center' : `TR:city:${String(regionCity).toLowerCase()}`;
      const cached = readWeatherCache(cacheKey, 15 * 60 * 1000);
      if (cached && alive) {
        setSnapshot(cached);
        setLoading(false);
        return;
      }

      // If "Tüm Bölgeler": use a fixed, reasonable Turkey center (no geocoding call).
      let latitude = 39.0;
      let longitude = 35.0;

      if (!isAll) {
        // Prefer city geocoding so region weather shows the HQ city (e.g., Ankara for 8. Bölge)
        const geo = await geocodeCityInTurkey(String(regionCity), ac.signal);
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
        } else {
          // Fallback: compute centroid from region locations
          const region = regions.find(r => r.id === selectedRegion);
          const locs = (region?.locations ?? []).filter(l => !isDirectorateLocation(l));
          const pts = locs
            .map(l => Array.isArray(l.coordinates) ? l.coordinates : null)
            .filter(Boolean) as Array<[number, number]>;
          if (pts.length) {
            const avgLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
            const avgLon = pts.reduce((s, p) => s + p[1], 0) / pts.length;
            if (Number.isFinite(avgLat) && Number.isFinite(avgLon)) {
              latitude = avgLat;
              longitude = avgLon;
            }
          }
        }
      }

      const data = await fetchCurrentWeather(latitude, longitude, ac.signal);
      if (!alive) return;

      setSnapshot(data);
      if (data) writeWeatherCache(cacheKey, data);
      setLoading(false);
    };

    run().catch(() => {
      if (!alive) return;
      setLoading(false);
      // keep old snapshot if any
    });

    return () => {
      alive = false;
      ac.abort();
    };
  }, [selectedRegion, regions]);

  if (!label) return null;

  const temp = snapshot ? Math.round(snapshot.temperatureC) : null;
  const wind = snapshot ? Math.round(snapshot.windSpeedKmh) : null;
  const desc = snapshot ? weatherCodeToTr(snapshot.weatherCode) : '';
  const Icon = snapshot ? iconForCode(snapshot.weatherCode) : Cloud;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="font-medium text-gray-600">{label}</span>
        <span className="text-gray-400">•</span>
        {loading && !snapshot ? (
          <span className="text-gray-400">Hava durumu yükleniyor…</span>
        ) : snapshot ? (
          <>
            <span className="text-gray-600">{temp}°C</span>
            <span className="text-gray-400">({desc})</span>
          </>
        ) : (
          <span className="text-gray-400">Hava durumu yok</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-5 h-5 text-gray-400" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-700 truncate">{label} Hava Durumu</div>
            <div className="text-xs text-gray-400 truncate">
              {loading && !snapshot ? 'Yükleniyor…' : snapshot ? desc : 'Veri alınamadı'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-gray-800 tabular-nums">
            {snapshot ? `${temp}°C` : '—'}
          </div>
        </div>
      </div>

      {snapshot && (
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Wind className="w-4 h-4 text-gray-400" />
            <span className="tabular-nums">{wind} km/s</span>
          </div>
        </div>
      )}
    </div>
  );
}
