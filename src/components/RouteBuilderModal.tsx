import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Location } from '../data/regions';
import { obtainCurrentPosition } from '../lib/deviceGeolocation';
import { fieldsMatchQuery } from '../lib/search';
import 'leaflet/dist/leaflet.css';
import { 
  X, MapPin, Navigation, Search, List, Map as MapIcon, 
  Download, Play, RefreshCw, Circle, ArrowRightLeft, 
  Ship, Filter, ChevronDown, Target, Route, 
  Compass, Clock, LocateFixed, Check, Minus, Plus
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  locations: Location[];
  regions?: { id: number; name: string; locations: Location[] }[];
  onStartRoute?: (route: Location[]) => void;
  userLocation?: [number, number] | null;
  initialSelectedIds?: string[];
  initialRegionFilter?: number;
  initialStartMode?: 'auto' | 'fixed' | 'current';
}

// Haversine distance (meters)
const haversine = (a: [number, number], b: [number, number]) => {
  const toRad = (v: number) => v * Math.PI / 180;
  const R = 6371000;
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

const escapeXml = (str: string | undefined) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};

const MAX_GOOGLE_WAYPOINTS = 23;
const MAX_AUTO_START_TRIES = 20;
const TWO_OPT_MAX_ITER = 20000;

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
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best >= 0) { visited[best] = true; route.push(best); }
  }
  return route;
};

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
        if (iterCount > TWO_OPT_MAX_ITER) return bestRoute;
        const a = bestRoute[i - 1];
        const b = bestRoute[i];
        const c = bestRoute[k];
        const d = bestRoute[k + 1];
        const current = dist(a, b) + dist(c, d);
        const swapped = dist(a, c) + dist(b, d);
        if (swapped + 1e-6 < current) {
          const newRoute = bestRoute.slice(0, i).concat(bestRoute.slice(i, k + 1).reverse()).concat(bestRoute.slice(k + 1));
          bestRoute = newRoute;
          improved = true;
        }
      }
    }
  }
  return bestRoute;
};

const metersToKmStr = (m: number) => `${(m/1000).toFixed(1)} km`;

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
  const [regionFilter, setRegionFilter] = useState<number>(0);
  const [avoidFerries, setAvoidFerries] = useState<boolean>(true);
  const [mobileView, setMobileView] = useState<'locations' | 'route' | 'map'>('locations');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [mapReadyNonce, setMapReadyNonce] = useState(0);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (Array.isArray(initialSelectedIds)) {
      setSelectedIds(initialSelectedIds);
      setFixedStartId(null);
    } else {
      setSelectedIds([]);
      setFixedStartId(null);
    }
    if (typeof initialRegionFilter === 'number') setRegionFilter(initialRegionFilter);
    else setRegionFilter(0);
    if (initialStartMode) setStartMode(initialStartMode);
    else setStartMode('auto');
    setSearchQuery('');
    setShowFilters(false);
    setMobileView('locations');
  }, [isOpen, initialSelectedIds, initialRegionFilter, initialStartMode]);

  const nameCollator = useMemo(() => new Intl.Collator('tr', { sensitivity: 'base', numeric: true }), []);

  const regionScopedLocations = useMemo(() => {
    let list: Location[] = [];
    if (regionFilter && regionFilter > 0 && regions && Array.isArray(regions)) {
      const r = regions.find(rr => rr.id === regionFilter);
      list = r ? r.locations : [];
    } else {
      list = locations || [];
    }
    return [...list].sort((a, b) => nameCollator.compare(a.name || '', b.name || ''));
  }, [regionFilter, regions, locations, nameCollator]);

  const displayedLocations = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return regionScopedLocations;
    return regionScopedLocations.filter(loc => fieldsMatchQuery(query, loc.name, loc.center, loc.id));
  }, [regionScopedLocations, searchQuery]);

  const selectedFiltered = useMemo(() => {
    const lookup = new Map(regionScopedLocations.map(loc => [String(loc.id), loc]));
    return selectedIds.map((id: string) => lookup.get(id)).filter(Boolean) as Location[];
  }, [selectedIds, regionScopedLocations]);

  const pts = useMemo(() => selectedFiltered.map(l => l.coordinates as [number, number]), [selectedFiltered]);

  useEffect(() => {
    if (startMode !== 'current') return;
    if (userLocation) {
      setCurrentCoords(userLocation);
      setGeoError(null);
      return;
    }
    setGeoError(null);
    (async () => {
      try {
        const [lat, lng] = await obtainCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
        setCurrentCoords([lat, lng]);
      } catch (err: any) {
        setGeoError(err?.message || String(err) || 'Konum alınamadı');
      }
    })();
  }, [startMode, userLocation]);

  const refreshGeolocation = async () => {
    setGeoError(null);
    try {
      const [lat, lng] = await obtainCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      setCurrentCoords([lat, lng]);
    } catch (err: any) {
      setGeoError(err?.message || String(err) || 'Konum alınamadı');
    }
  };

  const computeRouteSync = useCallback(() => {
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
      if (total < bestDist) { bestDist = total; bestOrder = improved; }
    }
    return { order: bestOrder, distance: bestDist, originIsCurrent: false, originCoord: null };
  }, [currentCoords, fixedStartId, pts, roundTrip, selectedFiltered, startMode]);

  const [routeResult, setRouteResult] = useState<{ order: number[]; distance: number; originIsCurrent: boolean; originCoord: [number, number] | null }>({ order: [], distance: 0, originIsCurrent: false, originCoord: null });
  const [computingRoute, setComputingRoute] = useState(false);

  const createRouteWorker = () => {
    // Inline worker code - don't use .toString() as it breaks after minification
    const workerCode = `
      // Haversine distance (meters)
      function haversine(a, b) {
        const toRad = (v) => v * Math.PI / 180;
        const R = 6371000;
        const dLat = toRad(b[0] - a[0]);
        const dLon = toRad(b[1] - a[1]);
        const lat1 = toRad(a[0]);
        const lat2 = toRad(b[0]);
        const sinDLat = Math.sin(dLat/2);
        const sinDLon = Math.sin(dLon/2);
        const A = sinDLat*sinDLat + Math.cos(lat1)*Math.cos(lat2)*sinDLon*sinDLon;
        const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1-A));
        return R * C;
      }

      function nearestNeighbor(points, startIndex) {
        if (points.length === 0) return [];
        const n = points.length;
        const visited = new Array(n).fill(false);
        const route = [startIndex];
        visited[startIndex] = true;
        for (let i = 1; i < n; i++) {
          const last = route[route.length - 1];
          let best = -1;
          let bestD = Infinity;
          for (let j = 0; j < n; j++) {
            if (visited[j]) continue;
            const d = haversine(points[last], points[j]);
            if (d < bestD) { bestD = d; best = j; }
          }
          if (best >= 0) { visited[best] = true; route.push(best); }
        }
        return route;
      }

      function twoOpt(route, points) {
        const n = route.length;
        if (n < 4) return route;
        let improved = true;
        const dist = (i, j) => haversine(points[i], points[j]);
        let bestRoute = route.slice();
        let iterCount = 0;
        const maxIter = 20000;
        while (improved) {
          improved = false;
          for (let i = 1; i < n - 2; i++) {
            for (let k = i + 1; k < n - 1; k++) {
              iterCount++;
              if (iterCount > maxIter) return bestRoute;
              const a = bestRoute[i - 1];
              const b = bestRoute[i];
              const c = bestRoute[k];
              const d = bestRoute[k + 1];
              const current = dist(a, b) + dist(c, d);
              const swapped = dist(a, c) + dist(b, d);
              if (swapped + 1e-6 < current) {
                const newRoute = bestRoute.slice(0, i).concat(bestRoute.slice(i, k + 1).reverse()).concat(bestRoute.slice(k + 1));
                bestRoute = newRoute;
                improved = true;
              }
            }
          }
        }
        return bestRoute;
      }

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
    return new Worker(url, { type: 'module' });
  };

  useEffect(() => {
    let mounted = true;
    const computeAsync = async () => {
      const n = pts.length;
      if (n === 0) { setRouteResult({ order: [], distance: 0, originIsCurrent: false, originCoord: null }); return; }
      if (n < 30 || typeof Worker === 'undefined') {
        const res = computeRouteSync();
        if (!mounted) return;
        setRouteResult(res as any);
        return;
      }
      setComputingRoute(true);
      const w = createRouteWorker();
      w.onmessage = (ev) => {
        if (!mounted) return;
        setRouteResult(ev.data);
        setComputingRoute(false);
        try { w.terminate(); } catch { /* ignore */ }
      };
      w.onerror = () => {
        const res = computeRouteSync();
        if (!mounted) return;
        setRouteResult(res as any);
        setComputingRoute(false);
        try { w.terminate(); } catch { /* ignore */ }
      };
      const fixedStartIndex = fixedStartId ? selectedFiltered.findIndex(l => l.id === fixedStartId) : -1;
      w.postMessage({ points: pts, startMode, fixedStartIndex: fixedStartIndex >= 0 ? fixedStartIndex : null, originCoord: currentCoords, roundTrip, maxAutoStartTries: MAX_AUTO_START_TRIES });
    };
    computeAsync();
    return () => { mounted = false; };
  }, [computeRouteSync, pts, startMode, fixedStartId, currentCoords, roundTrip, selectedFiltered]);

  const { order, distance, originIsCurrent, originCoord } = routeResult;

  // Build ordered latlngs for map
  const buildOrderedLatLngs = useCallback((): [number, number][] => {
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
  }, [order, originCoord, originIsCurrent, pts, roundTrip]);

  // Safe map cleanup helper
  const cleanupMap = () => {
    if (mapInstanceRef.current) {
      try {
        // First remove all layers to prevent DOM issues
        mapInstanceRef.current.eachLayer((layer: any) => {
          try { mapInstanceRef.current?.removeLayer(layer); } catch { /* ignore */ }
        });
        // Then remove the map itself
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch { /* ignore removeChild errors */ }
      mapInstanceRef.current = null;
    }
    // Clear leaflet ID from container
    if (mapContainerRef.current) {
      delete (mapContainerRef.current as any)._leaflet_id;
      // Also clear any leftover children (tiles, etc.) safely
      try {
        while (mapContainerRef.current.firstChild) {
          mapContainerRef.current.removeChild(mapContainerRef.current.firstChild);
        }
      } catch { /* ignore */ }
    }
  };

  // Map initialization
  useEffect(() => {
    if (!isOpen) return;
    
    // On mobile, only init map when map tab is active
    // On desktop (768px+), always init map
    const isMobile = window.innerWidth < 768;
    if (isMobile && mobileView !== 'map') return;
    
    if (!mapContainerRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      // Cleanup existing first
      cleanupMap();

      // Small delay to ensure DOM is ready
      await new Promise(r => setTimeout(r, 100));

      if (cancelled || !mapContainerRef.current) return;

      const L = await import('leaflet');
      leafletRef.current = L;

      if (cancelled || !mapContainerRef.current || (mapContainerRef.current as any)._leaflet_id) return;

      // Debug: check container size
      const containerRect = mapContainerRef.current.getBoundingClientRect();
      console.log('[RouteBuilderModal] Map container size:', containerRect.width, 'x', containerRect.height);

      try {
        const map = L.map(mapContainerRef.current, {
          center: [39.0, 35.0],
          zoom: 6,
          zoomControl: false,
        });

        console.log('[RouteBuilderModal] Map created successfully');

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OSM',
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);
        
        if (!cancelled) {
          mapInstanceRef.current = map;
          // Map init completes async; on mobile the marker-draw effect can run
          // before mapInstanceRef is set (refs don't trigger rerenders). Bump a
          // nonce to re-run marker rendering once the map exists.
          setMapReadyNonce(v => v + 1);
          // Force immediate invalidateSize
          map.invalidateSize();
          // Then multiple delayed calls to catch layout shifts
          [100, 200, 300, 500, 800, 1000, 1500].forEach(delay => {
            setTimeout(() => { 
              if (!cancelled && mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
              }
            }, delay);
          });
        } else {
          // If cancelled during init, cleanup immediately
          try { map.remove(); } catch { /* ignore */ }
        }
      } catch (err) {
        console.warn('Map init error:', err);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      cleanupMap();
    };
  }, [isOpen, mobileView]);

  // Resize map when container becomes visible or window resizes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const handleResize = () => {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    // Also trigger on mobileView change
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileView]);

  // Update map markers and route
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapInstanceRef.current;

    // Safely clear existing marker/polyline layers
    try {
      map.eachLayer((layer: any) => {
        try {
          if (layer instanceof L.CircleMarker || layer instanceof L.Polyline) {
            map.removeLayer(layer);
          }
        } catch { /* ignore individual layer removal errors */ }
      });
    } catch { /* ignore */ }

    const latlngs = buildOrderedLatLngs();

    // If we don't yet have a route order (or it failed), still show the selected points.
    if (latlngs.length === 0) {
      if (!Array.isArray(pts) || pts.length === 0) return;
      try {
        const markers: any[] = [];
        for (let i = 0; i < pts.length; i++) {
          const pos = pts[i];
          if (!pos) continue;
          const marker = L.circleMarker(pos, {
            radius: 8,
            fillColor: '#3b82f6',
            color: '#fff',
            weight: 3,
            fillOpacity: 1,
          }).addTo(map);
          const loc = selectedFiltered[i];
          const name = loc?.name ?? `Nokta ${i + 1}`;
          marker.bindPopup(`<div style="font-weight:600;font-size:13px">${escapeXml(name)}</div>`);
          markers.push(marker);
        }

        if (markers.length > 0) {
          const bounds = L.featureGroup(markers).getBounds();
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      } catch (err) {
        console.warn('Map fallback marker error:', err);
      }
      return;
    }

    try {
      // Draw route polyline
      const polyline = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
      }).addTo(map);

      // Draw markers
      latlngs.forEach((pos, i) => {
        const isStart = i === 0;
        const isEnd = i === latlngs.length - 1;
        
        const marker = L.circleMarker(pos, {
          radius: isStart ? 12 : isEnd ? 10 : 8,
          fillColor: isStart ? '#22c55e' : isEnd ? '#ef4444' : '#3b82f6',
          color: '#fff',
          weight: 3,
          fillOpacity: 1,
        }).addTo(map);

        // Popup content
        let name = `Durak ${i + 1}`;
        if (originIsCurrent && originCoord && i === 0) {
          name = 'Başlangıç (Mevcut Konum)';
        } else {
          const idx = originIsCurrent ? order[i] - 1 : order[i];
          const loc = selectedFiltered[idx];
          if (loc) name = loc.name;
        }
        marker.bindPopup(`<div style="font-weight:600;font-size:13px">${i + 1}. ${escapeXml(name)}</div>`);
      });

      // Fit bounds
      try {
        map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      } catch { /* ignore */ }
    } catch (err) {
      console.warn('Map update error:', err);
    }
  }, [buildOrderedLatLngs, order, pts, originIsCurrent, originCoord, roundTrip, selectedFiltered, mobileView, mapReadyNonce]);

  // Export GPX
  const exportGPX = async () => {
    if (!order || order.length === 0) return;
    const now = new Date().toISOString();
    type PointMeta = { lat: number; lng: number; name: string; center?: string };
    const pointsMeta: PointMeta[] = [];
    
    if (originIsCurrent && originCoord) {
      const ptsWithOrigin = [originCoord, ...pts];
      for (const idx of order) {
        if (idx === 0) {
          pointsMeta.push({ lat: ptsWithOrigin[0][0], lng: ptsWithOrigin[0][1], name: 'Mevcut Konum', center: '' });
        } else {
          const sel = selectedFiltered[idx - 1];
          pointsMeta.push({ lat: ptsWithOrigin[idx][0], lng: ptsWithOrigin[idx][1], name: sel?.name || `Nokta ${idx}`, center: sel?.center });
        }
      }
      if (roundTrip && order.length > 1) pointsMeta.push({ ...pointsMeta[0] });
    } else {
      for (const idx of order) {
        const sel = selectedFiltered[idx];
        const coord = pts[idx];
        pointsMeta.push({ lat: coord[0], lng: coord[1], name: sel?.name || `Nokta ${idx}`, center: sel?.center });
      }
      if (roundTrip && pointsMeta.length > 1) pointsMeta.push({ ...pointsMeta[0] });
    }

    const gpxParts: string[] = [];
    gpxParts.push('<?xml version="1.0" encoding="UTF-8"?>');
    gpxParts.push('<gpx version="1.1" creator="RouteBuilder" xmlns="http://www.topografix.com/GPX/1/1">');
    gpxParts.push(`  <metadata><name>Rota Export - ${now}</name><time>${now}</time></metadata>`);
    gpxParts.push('  <trk><name>Rota</name><trkseg>');
    pointsMeta.forEach((p, i) => {
      gpxParts.push(`      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><name>${escapeXml(`${i+1}. ${p.name}`)}</name></trkpt>`);
    });
    gpxParts.push('    </trkseg></trk></gpx>');
    const gpx = gpxParts.join('\n');

    try {
      const capFS = await import('@capacitor/filesystem');
      const capShare = await import('@capacitor/share');
      const { Filesystem, Directory } = capFS;
      const { Share } = capShare;
      const toBase64 = (str: string) => btoa(unescape(encodeURIComponent(str)));
      const base64 = toBase64(gpx);
      const fileName = `rota-${new Date().toISOString().replace(/[:.]/g, '-')}.gpx`;
      await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents });
      const uriRes = await Filesystem.getUri({ path: fileName, directory: Directory.Documents });
      await Share.share({ title: 'Rota GPX', url: uriRes.uri });
      return;
    } catch { /* fallback */ }

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rota-${new Date().toISOString().replace(/[:.]/g, '-')}.gpx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 2000);
  };

  // Open in Google Maps
  const openInGoogleMaps = () => {
    if (!order || order.length === 0) return;
    const points = pts as [number, number][];
    const fmt = (coord: [number, number]) => `${coord[0]},${coord[1]}`;

    if (originIsCurrent && originCoord) {
      const ptsWithOrigin = [originCoord, ...points];
      const coords = order.map(i => fmt(ptsWithOrigin[i]));
      const origin = coords[0];
      const destination = roundTrip ? origin : coords[coords.length - 1];
      const waypoints = roundTrip ? coords.slice(1) : coords.slice(1, coords.length - 1);
      
      if (waypoints.length > MAX_GOOGLE_WAYPOINTS) {
        for (let i = 0; i < waypoints.length; i += MAX_GOOGLE_WAYPOINTS) {
          const chunk = waypoints.slice(i, i + MAX_GOOGLE_WAYPOINTS);
          const isLast = i + MAX_GOOGLE_WAYPOINTS >= waypoints.length;
          const segs = roundTrip && isLast ? [origin, ...chunk, origin] : [origin, ...chunk];
          const url = `https://www.google.com/maps/dir/${segs.map(s => encodeURIComponent(s)).join('/')}?travelmode=driving${avoidFerries ? '&avoid=ferries' : ''}`;
          setTimeout(() => window.open(url, '_blank'), (i / MAX_GOOGLE_WAYPOINTS) * 250);
        }
        return;
      }
      
      const segs = roundTrip ? [origin, ...waypoints, origin] : [origin, ...waypoints, destination];
      const url = `https://www.google.com/maps/dir/${segs.map(s => encodeURIComponent(s)).join('/')}?travelmode=driving${avoidFerries ? '&avoid=ferries' : ''}`;
      window.open(url, '_blank');
      return;
    }

    const coords = order.map(i => fmt(points[i]));
    if (coords.length === 1) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords[0])}`, '_blank');
      return;
    }
    
    const origin = coords[0];
    const destination = roundTrip ? origin : coords[coords.length - 1];
    const waypoints = roundTrip ? coords.slice(1) : coords.slice(1, coords.length - 1);
    
    const segs = roundTrip ? [origin, ...waypoints, origin] : [origin, ...waypoints, destination];
    const url = `https://www.google.com/maps/dir/${segs.map(s => encodeURIComponent(s)).join('/')}?travelmode=driving${avoidFerries ? '&avoid=ferries' : ''}`;
    window.open(url, '_blank');
  };

  // Toggle location selection
  const toggleLocation = (locId: string) => {
    if (selectedIds.includes(locId)) {
      setSelectedIds(prev => prev.filter(id => id !== locId));
    } else {
      setSelectedIds(prev => [...prev, locId]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50">
      <div className="w-full h-full flex flex-col">
        
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 rounded-xl">
                <Route className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Rota Oluşturucu</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Akıllı rota optimizasyonu ile zamandan tasarruf edin</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-4 px-4 pb-3 bg-gray-50">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-800">{selectedIds.length}</span>
              <span className="text-xs text-gray-500">seçili</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200">
              <Navigation className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-800">{metersToKmStr(distance)}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-gray-800">~{Math.round(distance / 1000 / 50 * 60)} dk</span>
            </div>
          </div>
        </header>

        {/* Mobile Navigation */}
        <nav className="md:hidden shrink-0 flex bg-white border-b border-gray-200">
          {(['locations', 'route', 'map'] as const).map(tab => {
            const icons = { locations: List, route: Route, map: MapIcon };
            const labels = { locations: 'Lokasyonlar', route: 'Rota', map: 'Harita' };
            const Icon = icons[tab];
            const isActive = mobileView === tab;
            return (
              <button
                key={tab}
                onClick={() => setMobileView(tab)}
                className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                  isActive 
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {labels[tab]}
                {tab === 'locations' && selectedIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-blue-600 text-white">
                    {selectedIds.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden min-h-0" style={{ minHeight: 0 }}>
          
          {/* Left Panel: Location Selection */}
          <div className={`${mobileView === 'locations' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-96 lg:w-[420px] bg-white border-r border-gray-200`}>
            
            {/* Search & Filters */}
            <div className="shrink-0 p-4 space-y-3 border-b border-gray-200 bg-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Lokasyon ara..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    showFilters 
                      ? 'bg-blue-100 text-blue-600 border border-blue-200' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filtreler
                  <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
                
                <button
                  onClick={() => setSelectedIds(displayedLocations.map(l => String(l.id)))}
                  className="px-3 py-2 rounded-xl bg-white text-gray-600 text-sm font-medium border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  Tümünü Seç
                </button>
                
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => setSelectedIds([])}
                    className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    <Minus className="w-4 h-4 inline mr-1" />
                    Temizle
                  </button>
                )}
              </div>

              {showFilters && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Başlangıç Modu</label>
                    <select
                      value={startMode}
                      onChange={e => setStartMode(e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="auto">Otomatik</option>
                      <option value="fixed">Sabit Nokta</option>
                      <option value="current">Mevcut Konum</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Bölge</label>
                    <select
                      value={regionFilter}
                      onChange={e => setRegionFilter(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value={0}>Tüm Bölgeler</option>
                      {regions?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="col-span-2 flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={roundTrip}
                        onChange={e => setRoundTrip(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-50 border-gray-300 text-blue-500 focus:ring-blue-500/50"
                      />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Gidiş-Dönüş
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={avoidFerries}
                        onChange={e => setAvoidFerries(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-50 border-gray-300 text-blue-500 focus:ring-blue-500/50"
                      />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        <Ship className="w-3.5 h-3.5" /> Feribot Yok
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Location List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-gray-50">
              {displayedLocations.map(loc => {
                const locId = String(loc.id);
                const isSelected = selectedIds.includes(locId);
                return (
                  <button
                    key={loc.id}
                    onClick={() => toggleLocation(locId)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400 group-hover:bg-gray-300'
                    }`}>
                      {isSelected ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {loc.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {loc.center}
                      </div>
                    </div>
                    {loc.details.isActive ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                    )}
                  </button>
                );
              })}
              
              {displayedLocations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Search className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Lokasyon bulunamadı</p>
                </div>
              )}
            </div>
          </div>

          {/* Middle Panel: Route Preview */}
          <div className={`${mobileView === 'route' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 lg:w-96 shrink-0 bg-white border-r border-gray-200`}>
            
            {/* Route Header */}
            <div className="shrink-0 p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <Route className="w-4 h-4 text-blue-600" />
                  Optimize Edilmiş Rota
                </h2>
                {computingRoute && (
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                )}
              </div>

              {startMode === 'current' && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 mb-3">
                  <div className="flex items-center gap-2">
                    <LocateFixed className="w-4 h-4 text-blue-600" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-blue-700">Mevcut Konumdan Başla</div>
                      <div className="text-[10px] text-blue-600/70 truncate">
                        {currentCoords ? `${currentCoords[0].toFixed(5)}, ${currentCoords[1].toFixed(5)}` : geoError || 'Konum alınıyor...'}
                      </div>
                    </div>
                    <button onClick={refreshGeolocation} className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Route Steps */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {order && order.length > 0 ? (
                <div className="p-2">
                  {order.map((idx, orderIdx) => {
                    let locName = '';
                    let locCenter = '';
                    let isOrigin = false;

                    if (originIsCurrent) {
                      if (idx === 0) {
                        locName = 'Başlangıç Noktası';
                        isOrigin = true;
                      } else {
                        const sel = selectedFiltered[idx - 1];
                        locName = sel?.name || `Nokta ${idx}`;
                        locCenter = sel?.center || '';
                      }
                    } else {
                      const sel = selectedFiltered[idx];
                      locName = sel?.name || `Nokta ${idx}`;
                      locCenter = sel?.center || '';
                    }

                    const isLast = orderIdx === order.length - 1;

                    return (
                      <div key={orderIdx} className="flex gap-3 group">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isOrigin ? 'bg-emerald-500 text-white' : isLast ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600 group-hover:bg-blue-500 group-hover:text-white'
                          } transition-colors`}>
                            {orderIdx + 1}
                          </div>
                          {!isLast && (
                            <div className="w-0.5 h-8 bg-gray-300 group-hover:bg-blue-400 transition-colors" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-4">
                          <div className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                            {locName}
                          </div>
                          {locCenter && (
                            <div className="text-xs text-gray-500 truncate">{locCenter}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {roundTrip && order.length > 1 && (
                    <div className="flex gap-3 opacity-60">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500/30 border-2 border-dashed border-emerald-500">
                          <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 py-1">
                        <div className="text-sm font-medium text-emerald-400">Başlangıca Dönüş</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
                  <Target className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm text-center">Rota oluşturmak için<br />en az 1 lokasyon seçin</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="shrink-0 p-4 border-t border-gray-200 space-y-2 bg-white">
              <button
                onClick={() => {
                  if (order && order.length > 0) {
                    openInGoogleMaps();
                    if (onStartRoute) {
                      const ptsWithOrigin = originIsCurrent && originCoord ? [null, ...selectedFiltered] : selectedFiltered;
                      const routeLocations = order.map(idx => ptsWithOrigin[idx]).filter(Boolean) as Location[];
                      if (routeLocations.length > 0) onStartRoute(routeLocations);
                    }
                  }
                }}
                disabled={!order || order.length === 0 || computingRoute}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
              >
                {computingRoute ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Hesaplanıyor...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Rotayı Başlat
                  </>
                )}
              </button>
              
              <button
                onClick={exportGPX}
                disabled={!order || order.length === 0}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium border border-gray-200 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                GPX Olarak İndir
              </button>
            </div>
          </div>

          {/* Right Panel: Map */}
          <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} md:flex flex-1 flex-col bg-slate-950 relative min-h-0 overflow-hidden`} style={{ minHeight: '300px' }}>
            <div ref={mapContainerRef} className="w-full h-full" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }} />
            
            {/* Map Overlay Info */}
            {order && order.length > 0 && (
              <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-64 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700 p-4 shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Compass className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Toplam Mesafe</div>
                    <div className="text-lg font-bold text-white">{metersToKmStr(distance)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-lg font-bold text-blue-400">{order.length}</div>
                    <div className="text-[10px] text-slate-500">Durak</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded-lg">
                    <div className="text-lg font-bold text-amber-400">~{Math.round(distance / 1000 / 50 * 60)}</div>
                    <div className="text-[10px] text-slate-500">Dakika</div>
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700 p-3 shadow-xl">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-slate-400">Başlangıç</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-slate-400">Durak</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-slate-400">Bitiş</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteBuilderModal;
