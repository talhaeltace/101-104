import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import React, { useMemo, useState, useEffect } from 'react';
import { Location } from '../data/regions';
import { obtainCurrentPosition } from '../lib/deviceGeolocation';
import { fieldsMatchQuery } from '../lib/search';
import { 
  X, MapPin, Navigation, Search, List, Map as MapIcon, 
  Download, Play, RefreshCw, CheckCircle2, Circle, ArrowRightLeft, 
  Ship, Filter, ChevronDown
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  locations: Location[]; // available locations to choose from (flattened)
  regions?: { id: number; name: string; locations: Location[] }[]; // optional grouped regions
  onStartRoute?: (route: Location[]) => void; // callback when user starts tracking a route
  userLocation?: [number, number] | null; // user's current GPS location
  initialSelectedIds?: string[];
  initialRegionFilter?: number;
  initialStartMode?: 'auto' | 'fixed' | 'current';
}

// Haversine distance (meters)
const haversine = (a: [number, number], b: [number, number]) => {
  const toRad = (v: number) => v * Math.PI / 180;
  const R = 6371000; // meters
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const sinDLat = Math.sin(dLat/2);
  const sinDLon = Math.sin(dLon/2);
  const A = sinDLat*sinDLat + Math.cos(lat1)*Math.cos(lat2)*sinDLon*sinDLon;
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1-A));
  return R * C;
};

// Escape XML special chars for GPX fields
const escapeXml = (str: string | undefined) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};

// Configuration / limits
const MAX_GOOGLE_WAYPOINTS = 23; // Google Maps web supports ~23 waypoints reliably
const MAX_AUTO_START_TRIES = 20; // when many points, sample starts to avoid O(n^3)
const TWO_OPT_MAX_ITER = 20000; // safety cap for 2-opt inner work to avoid locking WebView

// Nearest Neighbor heuristic to obtain initial route, starting at `startIndex`
const nearestNeighbor = (points: [number, number][], startIndex = 0) => {
  if (points.length === 0) return [] as number[];
  const n = points.length;
  const visited = new Array(n).fill(false);
  const route: number[] = [startIndex];
  visited[startIndex] = true;
  for (let i = 1; i < n; i++) {
    const last = route[route.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = haversine(points[last], points[j]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0) {
      visited[best] = true;
      route.push(best);
    }
  }
  return route;
};

// 2-opt local optimization (improves route order)
// 2-opt local optimization (improves route order) with an optional iteration cap
const twoOpt = (route: number[], points: [number, number][]) => {
  const n = route.length;
  if (n < 4) return route;
  let improved = true;
  const dist = (i: number, j: number) => haversine(points[i], points[j]);
  let bestRoute = route.slice();
  let iterCount = 0;
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        iterCount++;
        if (iterCount > TWO_OPT_MAX_ITER) {
          // safety exit to avoid long-running CPU bursts in WebViews
          // return current best route so far
          return bestRoute;
        }
        const a = bestRoute[i - 1];
        const b = bestRoute[i];
        const c = bestRoute[k];
        const d = bestRoute[k + 1];
        const current = dist(a, b) + dist(c, d);
        const swapped = dist(a, c) + dist(b, d);
        if (swapped + 1e-6 < current) {
          // perform 2-opt swap
          const newRoute = bestRoute.slice(0, i).concat(bestRoute.slice(i, k + 1).reverse()).concat(bestRoute.slice(k + 1));
          bestRoute = newRoute;
          improved = true;
        }
      }
    }
  }
  return bestRoute;
};

const metersToKmStr = (m: number) => `${(m/1000).toFixed(2)} km`;

const RouteBuilderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  locations,
  regions,
  onStartRoute,
  userLocation,
  initialSelectedIds,
  initialRegionFilter,
  initialStartMode
}) => {
    useBodyScrollLock(isOpen);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startMode, setStartMode] = useState<'auto' | 'fixed' | 'current'>('auto');
  const [fixedStartId, setFixedStartId] = useState<string | null>(null);
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [currentCoords, setCurrentCoords] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLng, setManualLng] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<number>(0); // 0 = all
  const [avoidFerries, setAvoidFerries] = useState<boolean>(true);
  const [mobileTab, setMobileTab] = useState<'selection' | 'preview'>('selection');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Prefill selection/filter/mode when modal opens (used by task flow)
  useEffect(() => {
    if (!isOpen) return;
    if (Array.isArray(initialSelectedIds)) {
      setSelectedIds(initialSelectedIds);
      setShowManualEdit(false);
      setFixedStartId(null);
    } else {
      // default: clear previous selection so each open starts clean
      setSelectedIds([]);
      setShowManualEdit(false);
      setFixedStartId(null);
    }
    if (typeof initialRegionFilter === 'number') {
      setRegionFilter(initialRegionFilter);
    } else {
      setRegionFilter(0);
    }
    if (initialStartMode) {
      setStartMode(initialStartMode);
    } else {
      setStartMode('auto');
    }
    setSearchQuery('');
    setShowFilters(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Turkish-aware A–Z sorting for names (numeric + case-insensitive)
  const nameCollator = useMemo(() => new Intl.Collator('tr', { sensitivity: 'base', numeric: true }), []);

  // Determine which locations to show based on selected regionFilter
  const regionScopedLocations = useMemo(() => {
    let list: Location[] = [];
    if (regionFilter && regionFilter > 0 && regions && Array.isArray(regions)) {
      const r = regions.find(rr => rr.id === regionFilter);
      list = r ? r.locations : [];
    } else {
      list = locations || [];
    }
    // Return a sorted copy A–Z by name using Turkish collation
    return [...list].sort((a, b) => nameCollator.compare(a.name || '', b.name || ''));
  }, [regionFilter, regions, locations, nameCollator]);

  const displayedLocations = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return regionScopedLocations;
    return regionScopedLocations.filter(loc => fieldsMatchQuery(query, loc.name, loc.center, loc.id));
  }, [regionScopedLocations, searchQuery]);
  // selectedFiltered depends on selectedIds and displayedLocations
  const selectedFiltered = useMemo(() => {
    const lookup = new Map(regionScopedLocations.map(loc => [String(loc.id), loc]));
    return selectedIds
      .map((id: string) => lookup.get(id))
      .filter(Boolean) as Location[];
  }, [selectedIds, regionScopedLocations]);

  const pts = useMemo(() => selectedFiltered.map(l => l.coordinates as [number, number]), [selectedFiltered]);

  useEffect(() => {
    if (startMode !== 'current') return;
    
    // Try to use already-available userLocation first
    if (userLocation) {
      setCurrentCoords(userLocation);
      setManualLat(String(userLocation[0]));
      setManualLng(String(userLocation[1]));
      setGeoError(null);
      return;
    }
    
    // Fallback: request fresh location
    setGeoError(null);
    (async () => {
      try {
        const [lat, lng] = await obtainCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
        setCurrentCoords([lat, lng]);
        setManualLat(String(lat));
        setManualLng(String(lng));
      } catch (err: any) {
        setGeoError(err?.message || String(err) || 'Konum alınamadı');
      }
    })();
  }, [startMode, userLocation]);

  // Refresh helper so we can call it from a button as well
  const refreshGeolocation = async () => {
    setGeoError(null);
    try {
      const [lat, lng] = await obtainCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      setCurrentCoords([lat, lng]);
      setManualLat(String(lat));
      setManualLng(String(lng));
    } catch (err: any) {
      setGeoError(err?.message || String(err) || 'Konum alınamadı');
    }
  };

  // computeRouteSync: existing synchronous route computation (kept for small problems / fallback)
  const computeRouteSync = () => {
    const points = pts as [number, number][];
    const n = points.length;
    if (n === 0) return { order: [] as number[], distance: 0, originIsCurrent: false, originCoord: null };

    const evaluate = (routeIdx: number[], ptsArr: [number, number][]) => {
      let total = 0;
      for (let i = 0; i < routeIdx.length - 1; i++) {
        total += haversine(ptsArr[routeIdx[i]], ptsArr[routeIdx[i+1]]);
      }
      if (roundTrip && routeIdx.length > 1) {
        total += haversine(ptsArr[routeIdx[routeIdx.length - 1]], ptsArr[routeIdx[0]]);
      }
      return total;
    };

    // If startMode is 'current' and we have currentCoords, prepend origin
    if (startMode === 'current' && currentCoords) {
      const ptsWithOrigin = [currentCoords, ...points];
      const nn = nearestNeighbor(ptsWithOrigin, 0);
      const improved = twoOpt(nn, ptsWithOrigin);
      let total = 0;
      for (let i = 0; i < improved.length - 1; i++) total += haversine(ptsWithOrigin[improved[i]], ptsWithOrigin[improved[i+1]]);
      if (roundTrip && improved.length > 1) total += haversine(ptsWithOrigin[improved[improved.length - 1]], ptsWithOrigin[improved[0]]);
      return { order: improved, distance: total, originIsCurrent: true, originCoord: currentCoords };
    }

    const computeForStart = (startIdx: number) => {
      const nn = nearestNeighbor(points, startIdx);
      const improved = twoOpt(nn, points);
      const total = evaluate(improved, points);
      return { improved, total };
    };

    if (startMode === 'fixed' && fixedStartId) {
      const fixedIndex = selectedFiltered.findIndex(l => l.id === fixedStartId);
      const { improved, total } = computeForStart(fixedIndex >= 0 ? fixedIndex : 0);
      return { order: improved, distance: total, originIsCurrent: false, originCoord: null };
    }

    let bestOrder: number[] = [];
    let bestDist = Infinity;

    const starts: number[] = [];
    if (n <= MAX_AUTO_START_TRIES) {
      for (let s = 0; s < n; s++) starts.push(s);
    } else {
      starts.push(0);
      for (let i = 1; i < MAX_AUTO_START_TRIES - 1; i++) {
        const s = Math.floor((i / (MAX_AUTO_START_TRIES - 1)) * n);
        if (!starts.includes(s)) starts.push(s);
      }
      if (!starts.includes(n - 1)) starts.push(n - 1);
    }

    for (const s of starts) {
      const { improved, total } = computeForStart(s);
      if (total < bestDist) {
        bestDist = total;
        bestOrder = improved;
      }
    }
    return { order: bestOrder, distance: bestDist, originIsCurrent: false, originCoord: null };
  };

  // Async route computation backed by a Blob Worker for large N to avoid freezing UI
  const [routeResult, setRouteResult] = useState<{ order: number[]; distance: number; originIsCurrent: boolean; originCoord: [number, number] | null }>({ order: [], distance: 0, originIsCurrent: false, originCoord: null });
  const [computingRoute, setComputingRoute] = useState(false);

  // Create worker from blob string
  const createRouteWorker = () => {
    const workerCode = `
      ${haversine.toString()}
      ${nearestNeighbor.toString()}
      ${twoOpt.toString()}
      onmessage = function(e) {
        const { points, startMode, fixedStartIndex, originCoord, roundTrip, maxAutoStartTries } = e.data;
        const pts = points;
        function evaluate(routeIdx, ptsArr) {
          let total = 0;
          for (let i = 0; i < routeIdx.length - 1; i++) total += haversine(ptsArr[routeIdx[i]], ptsArr[routeIdx[i+1]]);
          if (roundTrip && routeIdx.length > 1) total += haversine(ptsArr[routeIdx[routeIdx.length - 1]], ptsArr[routeIdx[0]]);
          return total;
        }
        if (startMode === 'current' && originCoord) {
          const ptsWithOrigin = [originCoord].concat(pts);
          const nn = nearestNeighbor(ptsWithOrigin, 0);
          const improved = twoOpt(nn, ptsWithOrigin);
          let total = evaluate(improved, ptsWithOrigin);
          postMessage({ order: improved, distance: total, originIsCurrent: true, originCoord: originCoord });
          return;
        }
        if (startMode === 'fixed' && typeof fixedStartIndex === 'number') {
          const nn = nearestNeighbor(pts, fixedStartIndex);
          const improved = twoOpt(nn, pts);
          const total = evaluate(improved, pts);
          postMessage({ order: improved, distance: total, originIsCurrent: false, originCoord: null });
          return;
        }
        // auto: sample starts if large
        const n = pts.length;
        const starts = [];
        if (n <= maxAutoStartTries) { for (let s=0;s<n;s++) starts.push(s); }
        else { starts.push(0); for (let i=1;i<maxAutoStartTries-1;i++){ const s=Math.floor((i/(maxAutoStartTries-1))*n); if (!starts.includes(s)) starts.push(s); } if (!starts.includes(n-1)) starts.push(n-1); }
        let bestOrder=[]; let bestDist=Infinity;
        for (const s of starts) {
          const nn = nearestNeighbor(pts, s);
          const improved = twoOpt(nn, pts);
          const total = evaluate(improved, pts);
          if (total < bestDist) { bestDist = total; bestOrder = improved; }
        }
        postMessage({ order: bestOrder, distance: bestDist, originIsCurrent: false, originCoord: null });
      }
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url, { type: 'module' });
    return w;
  };

  useEffect(() => {
    let mounted = true;
    const computeAsync = async () => {
      const n = pts.length;
      // small problems: compute synchronously for instant feedback
      if (n === 0) { setRouteResult({ order: [], distance: 0, originIsCurrent: false, originCoord: null }); return; }
      if (n < 30 || typeof Worker === 'undefined') {
        const res = computeRouteSync();
        if (!mounted) return;
        setRouteResult(res as any);
        return;
      }
      setComputingRoute(true);
      const w = createRouteWorker();
      const maxAutoStartTries = MAX_AUTO_START_TRIES;
      w.onmessage = (ev) => {
        if (!mounted) return;
        setRouteResult(ev.data);
        setComputingRoute(false);
        try { w.terminate(); } catch (e) { /* ignore */ }
      };
      w.onerror = () => {
        // fallback to sync compute
        const res = computeRouteSync();
        if (!mounted) return;
        setRouteResult(res as any);
        setComputingRoute(false);
        try { w.terminate(); } catch (e) { /* ignore */ }
      };
      // determine fixed start index if needed
      const fixedStartIndex = fixedStartId ? selectedFiltered.findIndex(l => l.id === fixedStartId) : -1;
      w.postMessage({ points: pts, startMode, fixedStartIndex: fixedStartIndex >= 0 ? fixedStartIndex : null, originCoord: currentCoords, roundTrip, maxAutoStartTries });
    };
    computeAsync();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, startMode, fixedStartId, currentCoords, roundTrip, selectedFiltered]);

  const { order, distance, originIsCurrent, originCoord } = routeResult;

  // Build and download a GPX file representing the computed route (safe single-file export for mobile)
  const exportGPX = async () => {
    if (!order || order.length === 0) return;
    // helper to format ISO time
    const now = new Date().toISOString();

    // Build ordered list of points with metadata (lat,lng,name,center)
    type PointMeta = { lat: number; lng: number; name: string; center?: string };
    const pointsMeta: PointMeta[] = [];
    if (originIsCurrent && originCoord) {
      const ptsWithOrigin = [originCoord, ...pts];
      for (const idx of order) {
        if (idx === 0) {
          pointsMeta.push({ lat: ptsWithOrigin[0][0], lng: ptsWithOrigin[0][1], name: 'Mevcut Konum', center: '' });
        } else {
          const sel = selectedFiltered[idx - 1];
          const loc = sel || locations.find(l => l.id === (selectedIds[idx - 1] || ''));
          pointsMeta.push({ lat: ptsWithOrigin[idx][0], lng: ptsWithOrigin[idx][1], name: loc?.name || `Nokta ${idx}`, center: loc?.center });
        }
      }
      if (roundTrip && order.length > 1) pointsMeta.push({ ...pointsMeta[0] });
    } else {
      for (const idx of order) {
        const sel = selectedFiltered[idx];
        const loc = sel || locations.find(l => l.id === (selectedIds[idx] || ''));
        const coord = pts[idx];
        pointsMeta.push({ lat: coord[0], lng: coord[1], name: loc?.name || `Nokta ${idx}`, center: loc?.center });
      }
      if (roundTrip && pointsMeta.length > 1) pointsMeta.push({ ...pointsMeta[0] });
    }

    // Build GPX as a simple track with per-point name and desc
    const gpxParts: string[] = [];
    gpxParts.push('<?xml version="1.0" encoding="UTF-8"?>');
    gpxParts.push('<gpx version="1.1" creator="RouteBuilder" xmlns="http://www.topografix.com/GPX/1/1">');
    gpxParts.push(`  <metadata><name>Rota Export - ${now}</name><time>${now}</time></metadata>`);
    gpxParts.push('  <trk>');
    gpxParts.push(`    <name>Rota - ${now}</name>`);
    gpxParts.push('    <trkseg>');
    pointsMeta.forEach((p, i) => {
      const desc = p.center ? `<desc>${escapeXml(p.center)}</desc>` : '';
      const nm = `${i+1}. ${p.name}`;
      gpxParts.push(`      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${now}</time><name>${escapeXml(nm)}</name>${desc}</trkpt>`);
    });
    gpxParts.push('    </trkseg>');
    gpxParts.push('  </trk>');
    gpxParts.push('</gpx>');

    const gpx = gpxParts.join('\n');

    // Try Capacitor Filesystem + Share for mobile APKs
    try {
      // dynamic import so web bundlers don't require Capacitor at build time
      const capFS = await import('@capacitor/filesystem');
      const capShare = await import('@capacitor/share');
  const { Filesystem, Directory } = capFS;
  const { Share } = capShare;

      // base64 encode UTF-8 string
      const toBase64 = (str: string) => {
        try { return btoa(unescape(encodeURIComponent(str))); } catch (e) { return btoa(str); }
      };
  const base64 = toBase64(gpx);
      const fileName = `rota-${new Date().toISOString().replace(/[:.]/g, '-')}.gpx`;

      const dirsToTry = [Directory.Documents, Directory.Cache, Directory.Data];
      let fileUri: string | null = null;
      for (const dir of dirsToTry) {
        try {
          await Filesystem.writeFile({ path: fileName, data: base64, directory: dir });
          let uriRes: any = null;
          try { uriRes = await Filesystem.getUri({ path: fileName, directory: dir }); } catch (e) { /* ignore */ }
          fileUri = (uriRes && (uriRes.uri || uriRes.path)) || null;
          if (fileUri) break;
        } catch (e) {
          // try next dir
          continue;
        }
      }

      // Build share text with point names for messaging apps (WhatsApp shows this text)
      const shareLines = pointsMeta.map((p, i) => `${i+1}. ${p.name}${p.center ? ' — ' + p.center : ''}`);
      const shareText = `Rota (${pointsMeta.length} nokta):\n` + shareLines.join('\n');

      // Try a few Share variants. Some Capacitor versions support { files: [{ path }] }
      try {
        if (fileUri) {
          // try share with url
          await Share.share({ title: 'Rota GPX', text: shareText, url: fileUri });
          return;
        }
      } catch (e) {
        // ignore and try files variant
      }
      try {
        if (fileUri && (Share as any).share) {
          // Some environments accept files array
          await (Share as any).share({ title: 'Rota GPX', text: shareText, files: [{ path: fileUri }] });
          return;
        }
      } catch (e) {
        // fall through to web fallback
      }
      return;
    } catch (e) {
      // Capacitor not available or write/share failed; fall back to browser download
      // console.debug('Capacitor FS/Share failed, falling back to anchor download', e);
    }
    // Fallback: browser download (also include share text in an alert so user can copy)
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rota-${new Date().toISOString().replace(/[:.]/g, '-')}.gpx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 2000);
    try { alert('Rota metni:\n' + pointsMeta.map((p,i) => `${i+1}. ${p.name}${p.center ? ' — ' + p.center : ''}`).join('\n')); } catch (e) { /* ignore */ }
  };

  // In-app Leaflet preview state and refs
  const [showPreviewMap, setShowPreviewMap] = useState(false);
  const previewMapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const previewMapInstanceRef = React.useRef<any>(null);

  // Helper to build ordered lat/lng array (used by GPX and preview)
  const buildOrderedLatLngs = (): [number, number][] => {
    const out: [number, number][] = [];
    if (!order || order.length === 0) return out;
    if (originIsCurrent && originCoord) {
      const ptsWithOrigin = [originCoord, ...pts];
      for (const idx of order) out.push(ptsWithOrigin[idx]);
      if (roundTrip && order.length > 1) out.push(out[0]);
      return out;
    }
    for (const idx of order) out.push(pts[idx]);
    if (roundTrip && out.length > 1) out.push(out[0]);
    return out;
  };

  // Initialize preview map when requested
  useEffect(() => {
    if (!showPreviewMap) {
      // destroy if exists
      if (previewMapInstanceRef.current) {
        try { previewMapInstanceRef.current.remove(); } catch (e) { /* ignore */ }
        previewMapInstanceRef.current = null;
      }
      return;
    }
    (async () => {
      if (!previewMapContainerRef.current) return;
      const L = (await import('leaflet')) as any;
      // ensure CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      // create map
      previewMapInstanceRef.current = L.map(previewMapContainerRef.current, { zoomControl: true, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(previewMapInstanceRef.current);

      const latlngs = buildOrderedLatLngs();
      if (latlngs.length === 0) return;

      const markers: any[] = [];
      // Build matching metadata to show names/centers under markers
  const meta = buildOrderedLatLngs().map((_, i) => {
        // derive name/center similar to pointsMeta logic
        if (originIsCurrent && originCoord) {
          if (i === 0) return { name: 'Mevcut Konum', center: '' };
          const sel = selectedFiltered[i - 1];
          const loc = sel || locations.find(l => l.id === (selectedIds[i - 1] || ''));
          return { name: loc?.name || `Nokta ${i}`, center: loc?.center };
        }
        const sel = selectedFiltered[i];
        const loc = sel || locations.find(l => l.id === (selectedIds[i] || ''));
        return { name: loc?.name || `Nokta ${i}`, center: loc?.center };
      });

      latlngs.forEach((p, i) => {
        const m = L.circleMarker(p, { radius: 6, fillColor: i === 0 ? '#10b981' : '#2563eb', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(previewMapInstanceRef.current);
        const info = meta[i] || { name: `Nokta ${i+1}`, center: '' };
        m.bindPopup(`<div style="font-weight:600">${escapeXml(info.name)}</div><div style="font-size:12px;color:#4b5563">${escapeXml(info.center || '')}</div>`);
        markers.push(m);
      });

      // draw polyline
      const poly = L.polyline(latlngs, { color: '#2563eb', weight: 4, opacity: 0.85 }).addTo(previewMapInstanceRef.current);
      try { previewMapInstanceRef.current.fitBounds(poly.getBounds(), { padding: [20, 20] }); } catch (e) { /* ignore */ }

    })();
    // cleanup handled by hide branch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreviewMap]);

  const openInGoogleMaps = () => {
    if (!order || order.length === 0) return;
    // Build a Google Maps directions URL. Handle origin being current location
    const points = pts as [number, number][];

    // helper to format coord
    const fmt = (coord: [number, number]) => `${coord[0]},${coord[1]}`;

  if (originIsCurrent && originCoord) {
      // order indexes refer to ptsWithOrigin (origin at index 0).
      const ptsWithOrigin = [originCoord, ...points];
      const coords = order.map(i => fmt(ptsWithOrigin[i]));
      // Use origin explicitly
      const origin = coords[0];
      // For roundTrip we want to show the return leg: set destination = origin and include all others as waypoints
      let destination: string;
      let waypoints = '';
      if (roundTrip) {
        destination = origin;
        // include everything except the origin itself as waypoints (preserve order)
        const waypointCoords = coords.slice(1);
        waypoints = waypointCoords.join('|');
      } else {
        destination = coords[coords.length - 1];
        waypoints = coords.slice(1, coords.length - 1).join('|');
      }
      // Build a path-style URL which reliably shows the return leg for round trips
      const segments = roundTrip ? [origin, ...waypoints.split('|').filter(Boolean), origin] : [origin, ... (waypoints ? waypoints.split('|') : []), destination];
      const pathUrl = `https://www.google.com/maps/dir/${segments.map(s => encodeURIComponent(s)).join('/')}`;
      let url = pathUrl + '?travelmode=driving';
      if (avoidFerries) url += '&avoid=ferries';
      // If too many waypoints for a single Google URL, split into chunks and open sequentially
      if (coords.length - 1 > MAX_GOOGLE_WAYPOINTS) {
        const inner = coords.slice(1); // everything except origin
        const waypointChunks: string[][] = [];
        for (let i = 0; i < inner.length; i += MAX_GOOGLE_WAYPOINTS) {
          waypointChunks.push(inner.slice(i, i + MAX_GOOGLE_WAYPOINTS));
        }
        waypointChunks.forEach((chunk, idx) => {
          const isLast = idx === waypointChunks.length - 1;
          // For round-trip, append the origin only on the final chunk; intermediate chunks are origin->chunk
          const segs = roundTrip ? (isLast ? [origin, ...chunk, origin] : [origin, ...chunk]) : [origin, ...chunk];
          const chunkUrl = `https://www.google.com/maps/dir/${segs.map(s => encodeURIComponent(s)).join('/')}` + (avoidFerries ? '?travelmode=driving&avoid=ferries' : '?travelmode=driving');
          setTimeout(() => window.open(chunkUrl, '_blank', 'noopener'), idx * 250);
        });
        return;
      }
      window.open(url, '_blank', 'noopener');
      return;
    }

    // origin is one of the selected points
    const coords = order.map(i => fmt(points[i]));
    if (coords.length === 1) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords[0])}`, '_blank', 'noopener');
      return;
    }
    const origin = coords[0];
    let destination: string;
    let waypoints = '';
    if (roundTrip) {
      // show return leg by making destination the origin and including all others as waypoints
      destination = origin;
      waypoints = coords.slice(1).join('|');
    } else {
      destination = coords[coords.length - 1];
      waypoints = coords.slice(1, coords.length - 1).join('|');
    }
    // build path-style URL so return leg is explicit when roundTrip
    if (roundTrip) {
      const segments = [origin, ...coords.slice(1), origin];
      const pathUrl = `https://www.google.com/maps/dir/${segments.map(s => encodeURIComponent(s)).join('/')}`;
      let url = pathUrl + '?travelmode=driving';
      if (avoidFerries) url += '&avoid=ferries';
      if (coords.length - 1 > MAX_GOOGLE_WAYPOINTS) {
        // chunk export when too many waypoints; append return only on final chunk when roundTrip
        const inner = coords.slice(1);
        const chunks: string[][] = [];
        for (let i = 0; i < inner.length; i += MAX_GOOGLE_WAYPOINTS) {
          chunks.push(inner.slice(i, i + MAX_GOOGLE_WAYPOINTS));
        }
        chunks.forEach((chunk, idx) => {
          const isLast = idx === chunks.length - 1;
          const segs = roundTrip ? (isLast ? [origin, ...chunk, origin] : [origin, ...chunk]) : [origin, ...chunk];
          const chunkUrl = `https://www.google.com/maps/dir/${segs.map(s => encodeURIComponent(s)).join('/')}` + (avoidFerries ? '?travelmode=driving&avoid=ferries' : '?travelmode=driving');
          setTimeout(() => window.open(chunkUrl, '_blank', 'noopener'), idx * 250);
        });
        return;
      }
      window.open(url, '_blank', 'noopener');
      return;
    }

    const qOrigin = encodeURIComponent(origin);
    const qDestination = encodeURIComponent(destination);
    const qWaypoints = waypoints ? waypoints.split('|').map(w => encodeURIComponent(w)).join('|') : '';
    let url = `https://www.google.com/maps/dir/?api=1&origin=${qOrigin}&destination=${qDestination}`;
    if (qWaypoints) url += `&waypoints=${qWaypoints}`;
    // If there are too many waypoints for a single request, chunk them into multiple maps tabs
    const numWaypoints = qWaypoints ? qWaypoints.split('|').length : 0;
    if (numWaypoints > MAX_GOOGLE_WAYPOINTS) {
      const allWaypoints = qWaypoints.split('|');
      for (let i = 0; i < allWaypoints.length; i += MAX_GOOGLE_WAYPOINTS) {
        const chunk = allWaypoints.slice(i, i + MAX_GOOGLE_WAYPOINTS).join('|');
        let chunkUrl = `https://www.google.com/maps/dir/?api=1&origin=${qOrigin}&destination=${qDestination}`;
        if (chunk) chunkUrl += `&waypoints=${chunk}`;
        chunkUrl += `&travelmode=driving`;
        if (avoidFerries) chunkUrl += `&avoid=ferries`;
        setTimeout(() => window.open(chunkUrl, '_blank', 'noopener'), (i / MAX_GOOGLE_WAYPOINTS) * 250);
      }
      return;
    }
    url += `&travelmode=driving`;
    if (avoidFerries) url += `&avoid=ferries`;
    window.open(url, '_blank', 'noopener');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full h-full shadow-2xl overflow-hidden flex flex-col relative overscroll-contain">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg text-white hidden sm:block">
              <Navigation size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Rota Oluşturucu</h3>
              <p className="text-xs text-white/70 hidden sm:block">Lokasyonları seçin, rotanızı optimize edin ve yola çıkın.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white/80 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Mobile Tabs */}
        <div className="flex md:hidden border-b bg-white shrink-0">
          <button 
            onClick={() => setMobileTab('selection')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${mobileTab === 'selection' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <List size={16} /> Lokasyonlar ({selectedIds.length})
          </button>
          <button 
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${mobileTab === 'preview' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Navigation size={16} /> Rota Önizleme
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative min-h-0">
          
          {/* LEFT PANEL: Selection & Filters */}
          <div className={`flex-1 flex flex-col min-w-0 min-h-0 bg-gray-50/50 ${mobileTab === 'selection' ? 'flex' : 'hidden md:flex'}`}>
            
            {/* Filters Toolbar */}
            <div className="p-4 border-b bg-white space-y-3 shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Lokasyon ara..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <Filter size={18} />
                </button>
              </div>

              {/* Expanded Filters */}
              {(showFilters || window.innerWidth >= 768) && (
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${!showFilters && 'hidden md:grid'}`}>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 ml-1">Başlangıç Modu</label>
                    <div className="relative">
                      <select 
                        value={startMode} 
                        onChange={(e) => setStartMode(e.target.value as any)} 
                        className="w-full appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="auto">Otomatik (En Yakın)</option>
                        <option value="fixed">Sabit Lokasyon</option>
                        <option value="current">Mevcut Konum</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 ml-1">Bölge Filtresi</label>
                    <div className="relative">
                      <select 
                        value={regionFilter} 
                        onChange={(e) => setRegionFilter(Number(e.target.value))} 
                        className="w-full appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-indigo-500"
                      >
                        <option value={0}>Tüm Bölgeler</option>
                        {regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {startMode === 'fixed' && (
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-medium text-gray-500 ml-1">Başlangıç Noktası</label>
                      <div className="relative">
                        <select 
                          value={fixedStartId || ''} 
                          onChange={(e) => setFixedStartId(e.target.value || null)} 
                          className="w-full appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Listeden Seçiniz...</option>
                          {selectedFiltered.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Toggles */}
              <div className="flex flex-wrap gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none bg-white px-3 py-1.5 rounded-full border border-gray-200 hover:border-indigo-300 transition-colors">
                  <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  <ArrowRightLeft size={14} className="text-gray-500" />
                  <span>Gidiş-Dönüş</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none bg-white px-3 py-1.5 rounded-full border border-gray-200 hover:border-indigo-300 transition-colors">
                  <input type="checkbox" checked={avoidFerries} onChange={(e) => setAvoidFerries(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  <Ship size={14} className="text-gray-500" />
                  <span>Feribot Yok</span>
                </label>
              </div>

              {/* Selection Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs font-medium text-gray-500">{displayedLocations.length} lokasyon listeleniyor</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(displayedLocations.map(l => String(l.id)))} className="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors">Tümünü Seç</button>
                  <button onClick={() => setSelectedIds([])} className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 rounded transition-colors">Temizle</button>
                </div>
              </div>
            </div>

            {/* Location List */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2">
              {displayedLocations.map(loc => {
                const locId = String(loc.id);
                const checked = selectedIds.includes(locId);
                return (
                  <div 
                    key={loc.id} 
                    onClick={() => {
                      if (checked) setSelectedIds(prev => prev.filter(id => id !== locId));
                      else setSelectedIds(prev => [...prev, locId]);
                    }}
                    className={`group p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${checked ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'}`}
                  >
                    <div className={`mt-0.5 shrink-0 transition-colors ${checked ? 'text-indigo-600' : 'text-gray-300 group-hover:text-gray-400'}`}>
                      {checked ? <CheckCircle2 size={20} className="fill-indigo-100" /> : <Circle size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm truncate ${checked ? 'text-indigo-900' : 'text-gray-900'}`}>{loc.name}</div>
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                        <MapPin size={10} /> {loc.center}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {loc.details.isActive ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Aktif"></span>
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400" title="Pasif"></span>
                      )}
                    </div>
                  </div>
                );
              })}
              {displayedLocations.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <Search size={48} className="mx-auto mb-3 opacity-20" />
                  <p>Lokasyon bulunamadı.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Preview & Route */}
          <div className={`md:w-[400px] lg:w-[450px] shrink-0 border-l bg-white flex flex-col min-h-0 ${mobileTab === 'preview' ? 'flex flex-1' : 'hidden md:flex'}`}>
            
            {/* Stats Header */}
            <div className="p-4 border-b bg-gray-50/50 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Toplam Mesafe</div>
                  <div className="text-2xl font-bold text-gray-900">{metersToKmStr(distance)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Durak Sayısı</div>
                  <div className="text-2xl font-bold text-indigo-600">{order.length}</div>
                </div>
              </div>

              {startMode === 'current' && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-2">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 text-blue-600"><Navigation size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-blue-900">Mevcut Konum Başlangıçlı</div>
                      <div className="text-xs text-blue-700 truncate">
                        {currentCoords ? `${currentCoords[0].toFixed(6)}, ${currentCoords[1].toFixed(6)}` : (geoError || 'Konum alınıyor...')}
                      </div>
                    </div>
                    <button onClick={() => refreshGeolocation()} className="p-1 hover:bg-blue-100 rounded text-blue-600" title="Konumu Yenile">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  {geoError && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => setShowManualEdit(true)} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded shadow-sm">Elle Gir</button>
                    </div>
                  )}
                </div>
              )}

              {showManualEdit && (
                <div className="p-3 bg-gray-100 rounded-lg mb-2 border border-gray-200">
                  <div className="text-xs font-medium mb-2 text-gray-700">Manuel Koordinat Girişi</div>
                  <div className="flex gap-2 mb-2">
                    <input value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="Enlem" className="w-1/2 text-xs p-2 rounded border" />
                    <input value={manualLng} onChange={(e) => setManualLng(e.target.value)} placeholder="Boylam" className="w-1/2 text-xs p-2 rounded border" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowManualEdit(false)} className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded">İptal</button>
                    <button onClick={() => {
                      const lat = parseFloat(manualLat);
                      const lng = parseFloat(manualLng);
                      if (Number.isFinite(lat) && Number.isFinite(lng)) {
                        setCurrentCoords([lat, lng]);
                        setShowManualEdit(false);
                      }
                    }} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700">Uygula</button>
                  </div>
                </div>
              )}

              <button 
                onClick={() => setShowPreviewMap(true)}
                className="w-full py-2 flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <MapIcon size={16} /> Harita Önizlemesi
              </button>
            </div>

            {/* Route List */}
            <div className="flex-1 overflow-y-auto p-0">
              {order && order.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {order.map((idx, orderIdx) => {
                    let locName = '';
                    let locCenter = '';
                    let isOrigin = false;

                    if (originIsCurrent) {
                      if (idx === 0) {
                        locName = 'Mevcut Konum (Başlangıç)';
                        isOrigin = true;
                      } else {
                        const sel = selectedFiltered[idx - 1];
                        const id = sel ? sel.id : selectedIds[idx - 1];
                        const loc = locations.find(l => l.id === id) || sel;
                        locName = loc?.name || `Nokta ${idx}`;
                        locCenter = loc?.center || '';
                      }
                    } else {
                      const id = selectedFiltered[idx] ? selectedFiltered[idx].id : selectedIds[idx];
                      const loc = locations.find(l => l.id === id) || selectedFiltered[idx];
                      locName = loc?.name || `Nokta ${idx}`;
                      locCenter = loc?.center || '';
                    }

                    return (
                      <div key={orderIdx} className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors group">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isOrigin ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'}`}>
                            {orderIdx + 1}
                          </div>
                          {orderIdx < order.length - 1 && <div className="w-0.5 h-3 bg-gray-200 group-hover:bg-indigo-200"></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">{locName}</div>
                          {locCenter && <div className="text-xs text-gray-500 truncate">{locCenter}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                  <Navigation size={48} className="mb-3 opacity-20" />
                  <p className="text-sm">Rota oluşturmak için sol taraftan en az 2 lokasyon seçin.</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t bg-white space-y-3">
              <button 
                onClick={() => {
                  if (order && order.length > 0) {
                    openInGoogleMaps();
                    if (onStartRoute) {
                      const ptsWithOrigin = originIsCurrent && originCoord 
                        ? [null, ...selectedFiltered]
                        : selectedFiltered;
                      const routeLocations = order
                        .map(idx => ptsWithOrigin[idx])
                        .filter(loc => loc !== null && loc !== undefined) as Location[];
                      if (routeLocations.length > 0) onStartRoute(routeLocations);
                    }
                  }
                }} 
                disabled={!order || order.length === 0 || computingRoute} 
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
              >
                {computingRoute ? (
                  <>
                    <RefreshCw size={20} className="animate-spin" /> Hesaplanıyor...
                  </>
                ) : (
                  <>
                    <Play size={20} className="fill-white" /> Rotayı Başlat
                  </>
                )}
              </button>
              
              <button 
                onClick={() => { void exportGPX(); }} 
                disabled={!order || order.length === 0} 
                className="w-full py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <Download size={16} /> GPX Olarak İndir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Map Preview Modal Overlay */}
      {showPreviewMap && (
        <div className="absolute inset-0 z-[100000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-5xl h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-white">
              <h4 className="font-bold text-lg">Rota Haritası</h4>
              <button onClick={() => setShowPreviewMap(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 relative bg-gray-100">
              <div ref={previewMapContainerRef} className="absolute inset-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteBuilderModal;
