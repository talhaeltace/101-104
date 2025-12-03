import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { Geolocation } from '@capacitor/geolocation';
import { blobToBase64, saveAndShareFile, saveArrayBufferAndShare } from './lib/nativeFiles';
import { Location } from './data/regions';
import { useLocations } from './hooks/useLocations';
import MapComponent from './components/MapComponent';
import RegionSelector from './components/RegionSelector';
import LocationStats from './components/LocationStats';
import LocationList from './components/LocationList';
import LocationEditModal from './components/LocationEditModal';
import LocationSelector from './components/LocationSelector';
import LocationDetailsModal from './components/LocationDetailsModal';
import RouteBuilderModal from './components/RouteBuilderModal';
import ActivityWidget, { ActivityEntry } from './components/ActivityWidget';
import LocationTrackingOverlay from './components/LocationTrackingOverlay';
import { VersionChecker } from './components/VersionChecker';
import { useLocationTracking } from './hooks/useLocationTracking';
import { logArrival, logCompletion } from './lib/activityLogger';
import { requestNotificationPermission, notifyArrival, notifyCompletion, notifyNextLocation, notifyRouteCompleted, notifyRouteStarted } from './lib/notifications';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';
import { Routes, Route, Navigate } from 'react-router-dom';

function App() {
  const [selectedRegion, setSelectedRegion] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [focusLocation, setFocusLocation] = useState<Location | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [detailsModalLocation, setDetailsModalLocation] = useState<Location | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'user' | 'editor' | 'viewer' | null>(null);

  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string } | null>(null);

  const { locations, loading, error, updateLocation, createLocation, deleteLocation } = useLocations();
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);

  // Active route tracking state
  const [activeRoute, setActiveRoute] = useState<Location[] | null>(null);
  const [currentRouteIndex, setCurrentRouteIndex] = useState<number>(0);
  const [isTrackingRoute, setIsTrackingRoute] = useState<boolean>(false);
  
  // User's current location for distance calculation
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Initial work state for restoring from localStorage
  const [initialWorkState, setInitialWorkState] = useState<{ isWorking: boolean; workStartTime: Date | null } | undefined>(undefined);

  // Haversine distance calculation in km (kept for future use, currently unused)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Get current target location from active route
  const currentTargetLocation = activeRoute && currentRouteIndex < activeRoute.length 
    ? activeRoute[currentRouteIndex] 
    : null;

  // Use location tracking hook
  const {
    trackingState,
    confirmArrival,
    completeWork,
    resetTracking
  } = useLocationTracking({
    targetLocation: currentTargetLocation,
    proximityThreshold: 100,
    userPosition: userLocation,
    testMode: false,
    initialWorkState
  });

  // Restore route state from localStorage on mount
  useEffect(() => {
    try {
      const savedRoute = localStorage.getItem('active_route_state');
      if (savedRoute) {
        const parsed = JSON.parse(savedRoute);
        if (parsed.activeRoute && Array.isArray(parsed.activeRoute)) {
          setActiveRoute(parsed.activeRoute);
          setCurrentRouteIndex(parsed.currentRouteIndex || 0);
          setIsTrackingRoute(true);
          // Restore work state
          if (parsed.isWorking !== undefined) {
            setInitialWorkState({
              isWorking: parsed.isWorking,
              workStartTime: parsed.workStartTime ? new Date(parsed.workStartTime) : null
            });
          }
          // Focus on current location
          if (parsed.activeRoute[parsed.currentRouteIndex || 0]) {
            setFocusLocation(parsed.activeRoute[parsed.currentRouteIndex || 0]);
          }
        }
      }
    } catch (e) {
      // ignore invalid stored data
    }
  }, []);

  // Save route state to localStorage whenever it changes
  useEffect(() => {
    if (activeRoute && activeRoute.length > 0 && isTrackingRoute) {
      try {
        localStorage.setItem('active_route_state', JSON.stringify({
          activeRoute,
          currentRouteIndex,
          isWorking: trackingState.isWorking,
          workStartTime: trackingState.workStartTime?.toISOString(),
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        // ignore storage errors
      }
    }
  }, [activeRoute, currentRouteIndex, isTrackingRoute, trackingState.isWorking, trackingState.workStartTime]);

  // Tracking state is managed silently; no console logging to avoid refresh-like noise

  // Get user's current location for distance calculations
  // Initial position on mount, then update every 60 seconds when route is active
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    const isNativePlatform = platform !== 'web';

    const updateLocation = async () => {
      try {
        if (isNativePlatform) {
          const permission = await Geolocation.checkPermissions();
          if (permission.location !== 'granted') {
            const request = await Geolocation.requestPermissions();
            if (request.location !== 'granted') {
              return;
            }
          }
          try {
            const position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0
            });
            setUserLocation([position.coords.latitude, position.coords.longitude]);
          } catch {
            // ignore
          }
        } else {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const newLocation: [number, number] = [position.coords.latitude, position.coords.longitude];
              setUserLocation(newLocation);
            },
            () => {
              // ignore
            },
            {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0
            }
          );
        }
      } catch {
        // ignore
      }
    };

    // Get initial location
    updateLocation();

    // Update every 60 seconds only when route tracking is active
    let intervalId: NodeJS.Timeout | null = null;
    if (activeRoute && activeRoute.length > 0) {
      intervalId = setInterval(() => {
        updateLocation();
      }, 60000); // 60 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeRoute]);

  // load activities from supabase on mount (admins will see them)
  useEffect(() => {
    // Ensure native status bar does not overlay the WebView on Android/iOS
    try {
      if ((Capacitor as any).getPlatform && (Capacitor as any).getPlatform() !== 'web') {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      }
    } catch (e) {
      // ignore if plugin not available in web/dev
    }
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('activities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) {
          console.warn('Could not load activities', error);
          return;
        }
        const mapped = (data || []).map((r: any) => ({ 
          id: r.id, 
          user: r.username, 
          action: r.action, 
          time: r.created_at,
          location_id: r.location_id,
          location_name: r.location_name,
          activity_type: r.activity_type,
          duration_minutes: r.duration_minutes
        }));
        setActivities(mapped as ActivityEntry[]);
        if (mapped.length > 0) setLastUpdated(mapped[0].time);
      } catch (e) {
        console.warn('load activities error', e);
      }
    };
    load();
  }, []);

  // Request notification permission on mount (silent, no logs)
  useEffect(() => {
    requestNotificationPermission().catch(() => {
      // permission errors are non-fatal; UI will still work
    });
  }, []);

  // Tracking state is not persisted between sessions to keep behavior simple

  // Keep a CSS variable --vh in sync with the real viewport height so mobile 100vh calculations don't clip on rotation.
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, []);

  // Detect mobile / touch devices and force the mobile header layout (hamburger left)
  const [forceMobileHeader, setForceMobileHeader] = useState(false);
  const [isNarrow, setIsNarrow] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth < 768 : true);
  useEffect(() => {
    const detect = () => {
      const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
      const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      const coarsePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const maxTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
      setForceMobileHeader(isMobileUA || coarsePointer || !!maxTouch);
      setIsNarrow(typeof window !== 'undefined' ? window.innerWidth < 768 : true);
    };
    detect();
    window.addEventListener('resize', detect);
    window.addEventListener('orientationchange', detect);
    return () => {
      window.removeEventListener('resize', detect);
      window.removeEventListener('orientationchange', detect);
    };
  }, []);

  const showMobileHeader = forceMobileHeader || isNarrow;

  // Restore session from localStorage so refresh/geri butonunda login kalır
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('app_session_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user && parsed?.role) {
          setCurrentUser(parsed.user);
          setUserRole(parsed.role);
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setIsAuthChecking(false);
    }
  }, []);

  // Mobile drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'accepted'>('all');

  const currentRegion = locations.find(r => r.id === selectedRegion);
  const allLocations = useMemo(() => locations.flatMap(region => region.locations), [locations]);
  const currentLocations = selectedRegion === 0 ? allLocations : (currentRegion?.locations || []);



  // deployedCount and selectedDeployedCount removed (not used currently)

  // Export helpers
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    if (selectedRegion === 0) {
      locations.forEach(region => {
        const rows = region.locations.map(loc => ({
          İsim: loc.name,
          Merkez: loc.center,
          Marka: loc.brand,
          Model: loc.model,
          'Devreye Alinmis': loc.details.isActive ? 'Evet' : 'Hayır',
          Konfigüre: loc.details.isConfigured ? 'Evet' : 'Hayır',
          'Montaji Yapildi': loc.details.isInstalled ? 'Evet' : 'Hayır',
          'Kartlı Gecis': loc.details.hasCardAccess ? 'Evet' : 'Hayır',
          'Transformatör Tipi': loc.details.equipment.transformerCenterType
        }));
        const sheetName = `${region.id}. Bölge`;
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
      });
    } else {
      const rows = currentLocations.map(loc => ({
        İsim: loc.name,
        Merkez: loc.center,
        Marka: loc.brand,
        Model: loc.model,
        'Devreye Alinmis': loc.details.isActive ? 'Evet' : 'Hayır',
        Konfigüre: loc.details.isConfigured ? 'Evet' : 'Hayır',
        'Montaji Yapildi': loc.details.isInstalled ? 'Evet' : 'Hayır',
        'Kartlı Gecis': loc.details.hasCardAccess ? 'Evet' : 'Hayır',
        'Transformatör Tipi': loc.details.equipment.transformerCenterType
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, currentRegion ? `${currentRegion.id}. Bölge`.substring(0,31) : 'Lokasyonlar');
    }

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const regionLabel = selectedRegion === 0 ? 'tum_bolgeler' : (currentRegion?.name ?? String(selectedRegion));
    const safeLabel = String(regionLabel).replace(/\s+/g, '_');
    // If running as native app use Capacitor filesystem + share, else fallback to file-saver
    if ((Capacitor as any).getPlatform && (Capacitor as any).getPlatform() !== 'web') {
      // write array buffer directly
      saveArrayBufferAndShare(`lokasyonlar_${safeLabel}.xlsx`, excelBuffer.buffer).catch(err => console.warn('native excel save failed', err));
    } else {
      saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), `lokasyonlar_${safeLabel}.xlsx`);
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const tryLoadFont = async (doc: any, fontPath = '/fonts/DejaVuSans.ttf') => {
    try {
      const res = await fetch(fontPath);
      if (!res.ok) throw new Error('Font not found');
      const buf = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const vfsKey = 'DejaVuSans.ttf';
      doc.addFileToVFS(vfsKey, base64);
      doc.addFont(vfsKey, 'DejaVuSans', 'normal');
      return 'DejaVuSans';
    } catch (e) {
      console.warn('Could not load DejaVuSans.ttf, falling back to default font', e);
      return null;
    }
  };

  const formatLastUpdatedDisplay = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (e) {
      return iso;
    }
  };

  const pushActivity = async (user: string, action: string) => {
    const time = new Date().toISOString();
    try {
      const { data, error } = await supabase.from('activities').insert([{ username: user, action, created_at: time }]).select();
      if (error) {
        console.warn('Could not insert activity', error);
        return;
      }
      const inserted = data && data[0];
      const entry: ActivityEntry = { id: inserted?.id ?? crypto.randomUUID(), user, action, time: inserted?.created_at ?? time };
      const next = [entry, ...activities].slice(0, 200);
      setActivities(next);
      setLastUpdated(entry.time);
    } catch (e) {
      console.warn('pushActivity error', e);
    }
  };

  // Handle route cancellation
  const handleCancelRoute = () => {
    setIsTrackingRoute(false);
    setActiveRoute(null);
    setCurrentRouteIndex(0);
    resetTracking();
    
    // Clear saved route from localStorage
    try {
      localStorage.removeItem('active_route_state');
    } catch (e) {
      // ignore
    }
    
    // Log cancellation
    if (currentUser) {
      pushActivity(currentUser.username, 'Rota takibi iptal edildi');
    }
  };

  // Handle arrival confirmation
  const handleArrivalConfirm = async () => {
    if (!currentUser || !currentTargetLocation) return;
    confirmArrival();
    
    // Send notification
    notifyArrival(currentTargetLocation.name);
    
    // Log arrival to database
    await logArrival(
      currentUser.username,
      currentTargetLocation.id,
      currentTargetLocation.name,
      new Date()
    );

    // Refresh activities
    const { data } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    
    if (data) {
      const mapped = data.map((r: any) => ({
        id: r.id,
        user: r.username,
        action: r.action,
        time: r.created_at,
        location_id: r.location_id,
        location_name: r.location_name,
        activity_type: r.activity_type,
        duration_minutes: r.duration_minutes
      }));
      setActivities(mapped as ActivityEntry[]);
      if (mapped.length > 0) setLastUpdated(mapped[0].time);
    }
  };

  // Handle completion confirmation
  const handleCompletionConfirm = async () => {
    if (!currentUser || !currentTargetLocation) return;
    const result = completeWork();
    if (!result) return;

    const endTime = new Date();
    
    // Send notification
    notifyCompletion(currentTargetLocation.name, result.duration);
    
    // Log completion to database
    await logCompletion(
      currentUser.username,
      currentTargetLocation.id,
      currentTargetLocation.name,
      result.startTime,
      endTime,
      result.duration
    );

    // Move to next location in route
    if (activeRoute && currentRouteIndex < activeRoute.length - 1) {
      const nextIndex = currentRouteIndex + 1;
      const nextLocation = activeRoute[nextIndex];
      setCurrentRouteIndex(nextIndex);
      
      // Notify about next location
      notifyNextLocation(nextLocation.name, nextIndex + 1, activeRoute.length);
    } else {
      // Route completed
      notifyRouteCompleted();
      setIsTrackingRoute(false);
      setActiveRoute(null);
      setCurrentRouteIndex(0);
      resetTracking();
      
      // Clear saved route from localStorage
      try {
        localStorage.removeItem('active_route_state');
      } catch (e) {
        // ignore
      }
    }

    // Refresh activities
    const { data } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    
    if (data) {
      const mapped = data.map((r: any) => ({
        id: r.id,
        user: r.username,
        action: r.action,
        time: r.created_at,
        location_id: r.location_id,
        location_name: r.location_name,
        activity_type: r.activity_type,
        duration_minutes: r.duration_minutes
      }));
      setActivities(mapped as ActivityEntry[]);
      if (mapped.length > 0) setLastUpdated(mapped[0].time);
    }
  };

  // Tab visibility / beforeunload: do not touch state when tab comes back,
  // and logouts are handled explicitly by user action only.
  useEffect(() => {
    const onBeforeUnload = () => {
      // Intentionally no-op: we keep session and avoid side effects
    };

    const onVisibilityChange = () => {
      // Intentionally no-op on tab hide/show to avoid reset-like behavior
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Auto-logout is disabled; idle tracking and visibility handlers are completely removed
  // to prevent any state resets or logout triggers when switching tabs or backgrounding the app.

  const handleExportPDF = async () => {
  const doc: any = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const columns = ['Isim', 'Merkez', 'Marka', 'Model', 'Devreye Alinmis', 'Konfigüre', 'Montaji Yapildi', 'Kartli Gecis', 'Transformatör Tipi'];

    try {
      const loadedFont = await tryLoadFont(doc);
      if (loadedFont) {
        doc.setFont(loadedFont, 'normal');
      }

      const pageMargins = { left: 40, right: 40, top: 40, bottom: 40 };

      const innerPageWidth = doc.internal.pageSize.getWidth() - pageMargins.left - pageMargins.right;

      const commonAutoTableOpts: any = {
        // place table a bit lower so header title sits above it
        startY: pageMargins.top + 6,
        margin: { left: pageMargins.left, right: pageMargins.right },
        tableWidth: innerPageWidth,
        headStyles: {
          fillColor: [43, 108, 176],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'top',
          valign: 'top',
          overflow: 'linebreak',
          fontSize: 10
        },
        styles: {
          font: loadedFont || undefined,
          fontSize: 8,
          cellPadding: 6,
          overflow: 'linebreak',
          valign: 'left'
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        // Adjusted column widths for 9 columns in landscape
        columnStyles: {
          0: { cellWidth: 150 }, // İsim
          1: { cellWidth: 110 }, // Merkez
          2: { cellWidth: 90 },  // Marka
          3: { cellWidth: 80 },  // Model
          4: { cellWidth: 50 },  // Devreye Alınmış
          5: { cellWidth: 60 },  // Konfigüre
          6: { cellWidth: 60 },  // Montajı Yapıldı
          7: { cellWidth: 60 },  // Kartlı Geçiş
          8: { cellWidth: 140 }  // Transformatör Tipi
        },
        tableLineWidth: 0,
        tableLineColor: 200
      };

      const addHeaderAndFooter = (title: string) => {
        return (_data: any) => {
          doc.setFontSize(16);
          if (loadedFont) doc.setFont(loadedFont, 'normal');
          doc.setTextColor(30);
          doc.text('Lokasyonlar Dışa Aktarımı', pageMargins.left, 30);

          doc.setFontSize(12);
          if (loadedFont) doc.setFont(loadedFont, 'normal');
          doc.text(title, pageMargins.left, 15);

          const pageNumber = doc.internal.getCurrentPageInfo ? doc.internal.getCurrentPageInfo().pageNumber : doc.internal.getCurrentPageInfo?.().pageNumber;
          const totalPages = doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : undefined;
          doc.setFontSize(9);
          const footerText = totalPages ? `Sayfa ${pageNumber} / ${totalPages}` : `Sayfa ${pageNumber}`;
          doc.setTextColor(120);
          doc.text(footerText, doc.internal.pageSize.getWidth() - pageMargins.right, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
        };
      };

      if (selectedRegion === 0) {
        for (let i = 0; i < locations.length; i++) {
          const region = locations[i];
          if (!region.locations || region.locations.length === 0) continue;
          if (i > 0) doc.addPage();

          const regionTitle = `${region.id}. Bölge`;
          const rows = region.locations.map(loc => [
            loc.name,
            loc.center,
            loc.brand,
            loc.model,
            loc.details.isActive ? 'Evet' : 'Hayır',
            loc.details.isConfigured ? 'Evet' : 'Hayır',
            loc.details.isInstalled ? 'Evet' : 'Hayır',
            loc.details.hasCardAccess ? 'Evet' : 'Hayır',
            loc.details.equipment.transformerCenterType
          ]);

          autoTable(doc as any, {
            head: [columns],
            body: rows,
            didDrawPage: addHeaderAndFooter(regionTitle),
            ...commonAutoTableOpts
          });
        }
      } else {
        const regionTitle = `${currentRegion?.id}. Bölge`;
        const rows = currentLocations.map(loc => [
          loc.name,
          loc.center,
          loc.brand,
          loc.model,
          loc.details.isActive ? 'Evet' : 'Hayır',
          loc.details.isConfigured ? 'Evet' : 'Hayır',
          loc.details.isInstalled ? 'Evet' : 'Hayır',
          loc.details.hasCardAccess ? 'Evet' : 'Hayır',
          loc.details.equipment.transformerCenterType
        ]);

        autoTable(doc as any, {
          head: [columns],
          body: rows,
          didDrawPage: addHeaderAndFooter(regionTitle),
          ...commonAutoTableOpts
        });
      }

      const regionLabel = selectedRegion === 0 ? 'tum_bolgeler' : (currentRegion?.name ?? String(selectedRegion));
      const safeLabel = String(regionLabel).replace(/\s+/g, '_');
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      // If running as native app, export doc as blob and save via native helpers
      if ((Capacitor as any).getPlatform && (Capacitor as any).getPlatform() !== 'web') {
        const pdfBlob = doc.output('blob');
        const base64 = await blobToBase64(pdfBlob);
        await saveAndShareFile(`lokasyonlar_${safeLabel}_${timestamp}.pdf`, base64);
      } else {
        doc.save(`lokasyonlar_${safeLabel}_${timestamp}.pdf`);
      }
    } catch (err) {
      console.error('PDF export failed', err);
      alert('PDF dışa aktarımı sırasında hata oluştu. Konsolu kontrol edin.');
    }
  };

  const handleLocationSelect = (location: Location) => {
    setSelectedLocation(location);
  };

  const handleLocationDoubleClick = (location: Location) => {
    setView('map');
    setFocusLocation(location);
    setSelectedLocation(location);
  };

  const handleShowDetails = (location: Location) => {
    setDetailsModalLocation(location);
    setIsDetailsModalOpen(true);
  };

  useEffect(() => {
    setFocusLocation(null);
  }, [selectedRegion]);

  const handleLocationUpdate = async (updatedLocation: Location) => {
    const success = await updateLocation(updatedLocation);
    if (success) {
      setSelectedLocation(updatedLocation);
      const updatedRegions = locations.map(region => ({
        ...region,
        locations: region.locations.map(loc =>
          loc.id === updatedLocation.id ? updatedLocation : loc
        )
      }));

      const updatedLoc = updatedRegions
        .flatMap(r => r.locations)
        .find(loc => loc.id === updatedLocation.id);

      if (updatedLoc) {
        setSelectedLocation(updatedLoc);
        if (currentUser) pushActivity(currentUser.username, `Güncellendi: ${updatedLoc.name}`);
      }
    }
  };

  // Open a location by its displayed name (used when clicking activity entries)
  const openLocationByName = (name: string) => {
    if (!name) return;
    // find exact match first, then case-insensitive
    const all = allLocations;
    let found = all.find(l => l.name === name);
    if (!found) {
      const normalized = name.trim().toLowerCase();
      found = all.find(l => String(l.name).trim().toLowerCase() === normalized || String(l.name).toLowerCase().includes(normalized));
    }
    if (found) {
      setView('map');
      setFocusLocation(found);
      setSelectedLocation(found);
      // Also open the details modal for the found location
      try {
        setDetailsModalLocation(found);
        setIsDetailsModalOpen(true);
      } catch (e) {
        // ignore if modal state isn't available
      }
      // close drawer if open (mobile)
      try { setDrawerOpen(false); } catch (e) {}
    } else {
      console.warn('Could not find location for activity click:', name);
    }
  };

  const handleCreateLocation = async (newLocation: Location, regionId: number) => {
    if (!createLocation) return;
    const created = await createLocation(newLocation, regionId);
    if (created) {
      setSelectedLocation(created);
      setIsEditModalOpen(false);
      setIsCreateMode(false);
      if (currentUser) pushActivity(currentUser.username, `Oluşturuldu: ${created.name}`);
    }
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!deleteLocation) return false;
    const ok = await deleteLocation(locationId);
    if (ok) {
      if (selectedLocation?.id === locationId) setSelectedLocation(null);
      setIsEditModalOpen(false);
      setIsDetailsModalOpen(false);
      if (currentUser) pushActivity(currentUser.username, `Silindi: ${locationId}`);
    }
    return ok;
  };

  const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
    if (isAuthChecking) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      );
    }
    if (!userRole) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  if (loading || isAuthChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">⚠️</div>
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-gray-600">Varsayılan veriler kullanılıyor.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <VersionChecker />
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={(user) => {
        // Accept 'admin', 'editor', 'viewer' (case-insensitive) or default to 'user'
        const r = String(user.role || '').toLowerCase();
        const role = r === 'admin' ? 'admin' : (r === 'editor' ? 'editor' : (r === 'viewer' ? 'viewer' : 'user'));
        setUserRole(role);
        setCurrentUser(user);
        // persist session
        try { localStorage.setItem('app_session_v1', JSON.stringify({ user, role })); } catch (e) { }
        pushActivity(user.username, 'Giriş yaptı');
      }} />} />
      <Route path="/*" element={
        <RequireAuth>
          <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Header: on mobile show hamburger + logo + region selector only.
                On desktop show logo + region selector + actions (export, yeni/rota, avatar). */}
            <header className="fixed inset-x-0 top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm transition-all duration-300" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <div className="w-full px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16 sm:h-20">
                  <div className="flex items-center gap-4 shrink-0">
                    {/* Mobile hamburger: visible on mobile devices, placed on far left */}
                    <div className={showMobileHeader ? 'flex items-center mr-2' : 'hidden'}>
                      <button
                        onClick={() => setDrawerOpen(true)}
                        className="inline-flex items-center justify-center p-2 rounded-xl bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        aria-label="Menü"
                        title="Menü"
                      >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="3" y1="12" x2="21" y2="12"></line>
                          <line x1="3" y1="6" x2="21" y2="6"></line>
                          <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                      </button>
                    </div>

                    {/* Logo - Hidden on mobile, visible on desktop */}
                    <img src="/nelitlogo.png" alt="NELİT" className={`${showMobileHeader ? 'hidden' : 'block'} h-10 w-auto object-contain`} />
                  </div>

                  {/* Center: region selector - keeps centered and visible on all sizes */}
                  <div className="flex-1 flex justify-center px-4 sm:px-8">
                    <div className="w-full max-w-xl transform transition-all duration-200 hover:scale-[1.01]">
                      <RegionSelector selectedRegion={selectedRegion} onRegionChange={setSelectedRegion} />
                    </div>
                  </div>

                  {/* Right side: desktop-only actions (hidden on mobile header) */}
                  <div className={`${showMobileHeader ? 'hidden' : 'hidden md:flex'} items-center gap-4`}>
                    {userRole === 'admin' && (
                      <div className="mr-2">
                        <ActivityWidget lastUpdated={lastUpdated} activities={activities} onOpenLocation={openLocationByName} />
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-full border border-gray-100">
                        <button onClick={handleExportExcel} className="p-2 text-gray-600 hover:text-green-600 hover:bg-white rounded-full transition-all duration-200" title="Excel'e Aktar">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/></svg>
                        </button>

                        <button onClick={handleExportPDF} className="p-2 text-gray-600 hover:text-red-600 hover:bg-white rounded-full transition-all duration-200" title="PDF'e Aktar">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 8v8M8 12h8"/></svg>
                        </button>
                    </div>

                    {/* Admin actions visible on desktop */}
                    {(userRole === 'admin' || userRole === 'editor') && (
                      <div className="flex items-center gap-2">
                        {userRole === 'admin' && (
                          <button
                            onClick={() => {
                              const template: Location = {
                                id: '',
                                name: '',
                                center: '',
                                coordinates: [0, 0],
                                brand: '',
                                model: '',
                                details: {
                                  hasGPS: false,
                                  hasRTU: false,
                                  hasPanos: false,
                                  isActive: false,
                                  isConfigured: false,
                                  equipment: {
                                    securityFirewall: 0,
                                    networkSwitch: 0,
                                    rtuCount: 0,
                                    gpsCardAntenna: 0,
                                    rtuPanel: 0,
                                    btpPanel: 0,
                                    energyAnalyzer: 0,
                                    ykgcCount: 0,
                                    teiasRtuInstallation: 0,
                                    indoorDomeCamera: 0,
                                    networkVideoManagement: 0,
                                    smartControlUnit: 0,
                                    cardReader: 0,
                                    networkRecordingUnit: 0,
                                    accessControlSystem: 0,
                                    transformerCenterType: ''
                                  },
                                  tags: ''
                                }
                              };
                              setSelectedLocation(template);
                              setIsCreateMode(true);
                              setIsEditModalOpen(true);
                            }}
                            className="flex items-center justify-center w-10 h-10 bg-amber-500 text-white rounded-full hover:bg-amber-600 shadow-sm hover:shadow-md transition-all duration-200"
                            title="Yeni Lokasyon"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          </button>
                        )}

                        <button
                          onClick={() => setIsRouteModalOpen(true)}
                          className="flex items-center justify-center w-10 h-10 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 shadow-sm hover:shadow-md transition-all duration-200"
                          title="Rota Oluştur"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                        </button>
                      </div>
                    )}

                    {/* Avatar / Logout */}
                    <div className="flex items-center pl-4 border-l border-gray-200 ml-2">
                        <div className="flex items-center gap-3 group cursor-pointer">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md ring-2 ring-white group-hover:ring-blue-100 transition-all">
                                {(currentUser?.username ?? 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="hidden xl:block">
                                <div className="text-sm font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">{currentUser?.username ?? ''}</div>
                                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{userRole === 'admin' ? 'Yönetici' : userRole === 'editor' ? 'Editör' : userRole === 'viewer' ? 'İzleyici' : 'Kullanıcı'}</div>
                            </div>
                        </div>
                        <button 
                            onClick={async () => { if (currentUser) { try { await pushActivity(currentUser.username, 'Çıkış yaptı'); } catch (e) { console.warn('pushActivity failed on logout', e); } } setUserRole(null); setCurrentUser(null); window.location.href = '/login'; }} 
                            className="ml-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all duration-200"
                            title="Çıkış Yap"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* Drawer for mobile containing all actions (export, yeni, rota, görünüm, profile etc.) */}
            {drawerOpen && (
              <>
                <div
                  className="fixed inset-0 bg-black/30 z-40"
                  onClick={() => setDrawerOpen(false)}
                  aria-hidden
                />
                <aside className="fixed top-0 left-0 z-50 h-full w-72 bg-white shadow-2xl p-4 overflow-auto">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      {/* Mobile drawer: show last-updated and recent activities for quick access */}
                      {userRole === 'admin' ? (
                          <div className="mb-2">
                            <div className="text-xs text-gray-600">Son güncelleme</div>
                            <div className="text-sm font-medium text-gray-800">{formatLastUpdatedDisplay(lastUpdated)}</div>
                          </div>
                        ) : (
                          <div className="mb-2">
                            <div className="text-sm font-medium">Hızlı Menü</div>
                          </div>
                        )}
                    </div>
                    <button onClick={() => setDrawerOpen(false)} className="p-1 rounded-md bg-gray-100">
                      <svg className="w-5 h-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Quick activity peek for admins */}
                    {userRole === 'admin' && (
                      <div>
                        <ActivityWidget inline={true} lastUpdated={lastUpdated} activities={activities} onOpenLocation={openLocationByName} />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium mb-2">Dışa Aktar</div>
                      <div className="flex gap-2">
                        <button onClick={() => { handleExportExcel(); setDrawerOpen(false); }} className="flex-1 px-3 py-2 bg-white border rounded-md text-sm shadow-sm">Excel'e Aktar</button>
                        <button onClick={() => { handleExportPDF(); setDrawerOpen(false); }} className="flex-1 px-3 py-2 bg-white border rounded-md text-sm shadow-sm">PDF'e Aktar</button>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Görünüm</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setView('map'); setDrawerOpen(false); }}
                          className={`flex-1 px-3 py-2 rounded-md text-sm ${view === 'map' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
                        >
                          Harita
                        </button>
                        <button
                          onClick={() => { setView('list'); setDrawerOpen(false); }}
                          className={`flex-1 px-3 py-2 rounded-md text-sm ${view === 'list' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
                        >
                          Liste
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Hesap</div>
                      {userRole ? (
                        <>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-sm">{(currentUser?.username ?? 'U').charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="font-medium">{currentUser?.username}</div>
                              <div className="text-xs text-gray-500">{userRole === 'admin' ? 'Admin' : userRole === 'editor' ? 'Editor' : userRole === 'viewer' ? 'Viewer' : 'User'}</div>
                            </div>
                          </div>
                          <button onClick={async () => { if (currentUser) { try { await pushActivity(currentUser.username, 'Çıkış yaptı'); } catch (e) { console.warn('pushActivity failed on drawer logout', e); } } setUserRole(null); setCurrentUser(null); window.location.href = '/login'; }} className="mt-2 w-full px-3 py-2 bg-red-600 text-white rounded-md">Çıkış</button>
                        </>
                      ) : (
                        <button onClick={() => window.location.href = '/login'} className="w-full px-3 py-2 bg-blue-600 text-white rounded-md">Giriş</button>
                      )}
                    </div>

                    {(userRole === 'admin' || userRole === 'editor') && (
                      <div>
                        <div className="text-sm font-medium mb-2">Yönetim</div>
                        <div className="flex gap-2">
                          {userRole === 'admin' && (
                            <button
                              onClick={() => {
                                const template: Location = {
                                  id: '',
                                  name: '',
                                  center: '',
                                  coordinates: [0, 0],
                                  brand: '',
                                  model: '',
                                  details: {
                                    hasGPS: false,
                                    hasRTU: false,
                                    hasPanos: false,
                                    isActive: false,
                                    isConfigured: false,
                                    equipment: {
                                      securityFirewall: 0,
                                      networkSwitch: 0,
                                      rtuCount: 0,
                                      gpsCardAntenna: 0,
                                      rtuPanel: 0,
                                      btpPanel: 0,
                                      energyAnalyzer: 0,
                                      ykgcCount: 0,
                                      teiasRtuInstallation: 0,
                                      indoorDomeCamera: 0,
                                      networkVideoManagement: 0,
                                      smartControlUnit: 0,
                                      cardReader: 0,
                                      networkRecordingUnit: 0,
                                      accessControlSystem: 0,
                                      transformerCenterType: ''
                                    },
                                    tags: ''
                                  }
                                };
                                setSelectedLocation(template);
                                setIsCreateMode(true);
                                setIsEditModalOpen(true);
                                setDrawerOpen(false);
                              }}
                              className="flex-1 px-3 py-2 bg-yellow-500 text-white rounded-md text-sm font-medium hover:bg-yellow-600 shadow-sm"
                            >
                              Yeni Lokasyon
                            </button>
                          )}

                          <button
                            onClick={() => { setIsRouteModalOpen(true); setDrawerOpen(false); }}
                            className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 shadow-sm"
                          >
                            Rota Oluştur
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              </>
            )}

            {/* main: pad top so content doesn't hide under fixed header */}
            <main className="pt-20 sm:pt-24 w-full px-4 sm:px-6 lg:px-8 pb-20">
              {/* Mobile compact stats (show parentheses with selected counts) */}
              <div className="mb-4">
                <div className="grid grid-cols-1 gap-4">
                  <LocationStats locations={allLocations} selectedRegionLocations={currentLocations} />
                </div>
              </div>

              {/* Content */}
              {view === 'map' ? (
                <div className="space-y-4">
         <div className="bg-black rounded-t-lg shadow-md border border-gray-200 w-full overflow-hidden"
           style={{ minHeight: 'calc(var(--vh, 1vh) * 40)' }}>
                    <div className="map-responsive w-full">
                      <MapComponent
                        regions={locations}
                        locations={currentLocations}
                        selectedRegion={selectedRegion}
                        onLocationSelect={handleLocationSelect}
                        onRegionSelect={(id) => setSelectedRegion(id)}
                        focusLocation={focusLocation}
                        setFocusLocation={setFocusLocation}
                        activeRoute={activeRoute}
                        currentRouteIndex={currentRouteIndex}
                        userLocation={userLocation}
                        calculateDistance={calculateDistance}
                      />
                    </div>
                  </div>

                  <div className="mt-2">
                    <LocationSelector
                      locations={currentLocations}
                      regions={locations}
                      selectedRegion={selectedRegion}
                      selectedLocation={selectedLocation}
                      onLocationSelect={handleLocationSelect}
                      onShowDetails={handleShowDetails}
                      onLocationDoubleClick={handleLocationDoubleClick}
                      statusFilter={statusFilter}
                      onStatusFilterChange={setStatusFilter}
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md border border-gray-200 h-[600px]">
                  <LocationList
                    locations={currentLocations}
                    onLocationSelect={handleLocationSelect}
                    onShowDetails={handleShowDetails}
                    onLocationDoubleClick={(location) => {
                      setView('map');
                      setFocusLocation(location);
                      setSelectedLocation(location);
                    }}
                  />
                </div>
              )}

              {/* Edit Modal */}
              {selectedLocation && (
                <LocationEditModal
                  location={selectedLocation}
                  isOpen={isEditModalOpen}
                  isCreate={isCreateMode}
                  isAdmin={userRole === 'admin'}
                  isEditor={userRole === 'editor'}
                  onClose={() => { setIsEditModalOpen(false); setIsCreateMode(false); }}
                  onSave={async (loc: Location) => {
                    if (isCreateMode) {
                      const regionId = selectedRegion === 0 ? 1 : selectedRegion;
                      await handleCreateLocation(loc, regionId);
                    } else {
                      await handleLocationUpdate(loc);
                    }
                  }}
                  onDelete={async (id: string) => {
                    const confirmed = window.confirm('Bu lokasyonu silmek istediğinizden emin misiniz?');
                    if (!confirmed) return false;
                    return await handleDeleteLocation(id);
                  }}
                />
              )}
              {/* Details Modal (centered) */}
              {detailsModalLocation && (
                <LocationDetailsModal
                  location={detailsModalLocation}
                  isOpen={isDetailsModalOpen}
                  onClose={() => setIsDetailsModalOpen(false)}
                  onEdit={(loc) => {
                    setSelectedLocation(loc);
                    setIsDetailsModalOpen(false);
                    setIsEditModalOpen(true);
                  }}
                  isAdmin={userRole === 'admin'}
                  isEditor={userRole === 'editor'}
                  isViewer={userRole === 'viewer'}
                />
              )}
              {/* Route Builder Modal */}
              <RouteBuilderModal
                isOpen={isRouteModalOpen}
                onClose={() => setIsRouteModalOpen(false)}
                locations={allLocations}
                regions={locations}
                userLocation={userLocation}
                onStartRoute={(route: Location[]) => {
                  setActiveRoute(route);
                  setCurrentRouteIndex(0);
                  setIsTrackingRoute(true);
                  setView('map');
                  // Bildirim: rota başlatıldı
                  notifyRouteStarted(currentUser?.username ?? null, route.length);
                  
                  // Focus on first location
                  if (route.length > 0) {
                    setFocusLocation(route[0]);
                    setSelectedLocation(route[0]);
                  }
                  setTimeout(() => {
                    setIsRouteModalOpen(false);
                  }, 100);
                }}
              />

              {/* Location Tracking Overlay */}
              {activeRoute && activeRoute.length > 0 && (
                <LocationTrackingOverlay
                  currentLocation={currentTargetLocation}
                  distanceToTarget={trackingState.distanceToTarget}
                  isNearby={trackingState.isNearby}
                  isWorking={trackingState.isWorking}
                  workStartTime={trackingState.workStartTime}
                  onArrivalConfirm={handleArrivalConfirm}
                  onCompletionConfirm={handleCompletionConfirm}
                  onCancelRoute={handleCancelRoute}
                />
              )}
            </main>
          </div>
        </RequireAuth>
      } />
      </Routes>
    </>
  );
}

export default App;