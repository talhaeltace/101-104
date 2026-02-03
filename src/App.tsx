import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { blobToBase64, saveAndShareFile, saveArrayBufferAndShare } from './lib/nativeFiles';
import { Location } from './data/regions';
import { useLocations } from './hooks/useLocations';
import MapComponent from './components/MapComponent';
import RegionSelector from './components/RegionSelector';
import WeatherWidget from './components/WeatherWidget';
import LocationStats from './components/LocationStats';
import LocationList from './components/LocationList';
import LocationEditModal from './components/LocationEditModal';
import LocationSelector from './components/LocationSelector';
import LocationDetailsModal from './components/LocationDetailsModal';
import RouteBuilderModal from './components/RouteBuilderModal';
import ActivityWidget, { ActivityEntry } from './components/ActivityWidget';
import LocationTrackingOverlay from './components/LocationTrackingOverlay';
import TasksPanel from './components/TasksPanel';
import { VersionChecker } from './components/VersionChecker';
import { useLocationTracking } from './hooks/useLocationTracking';
import { getActivities, logActivity, logArrival, logCompletion } from './lib/activityLogger';
import { logWorkEntry } from './lib/workEntries';
import { requestNotificationPermission, notifyArrival, notifyCompletion, notifyNextLocation, notifyRouteCompleted, notifyRouteStarted, notifyPermissionsUpdated, notifyAcceptanceRequest } from './lib/notifications';
import type { AuthUser } from './lib/authUser';
import { DEFAULT_PERMISSIONS } from './lib/userPermissions';
import { createAcceptanceRequest, listPendingAcceptanceRequests } from './lib/acceptanceRequests';
import LoginPage from './pages/LoginPage';
import TeamPanel from './components/TeamPanel';
import AdminPanel from './components/AdminPanel';
import AdminAcceptanceRequestsFullscreen from './components/AdminAcceptanceRequestsFullscreen';
import AdminAssignedTasksFullscreen from './components/AdminAssignedTasksFullscreen';
import MesaiTrackingPanel from './components/MesaiTrackingPanel';
import MessagesOverlay from './components/MessagesOverlay';
import AdminMessagesOverlay from './components/AdminMessagesOverlay';
import LiveMapPanel from './components/LiveMapPanel';
import { MobileBottomNav, type MobileTabKey } from './components/MobileBottomNav';
import { MobileSheet } from './components/MobileSheet';
import { updateTeamStatus, clearTeamStatus, getUserRoute, CompletedLocationInfo, calculateMinutesBetween } from './lib/teamStatus';
import {
  saveTrackingState,
  loadTrackingState,
  clearTrackingState,
  savePendingTeamStatusUpdate,
  loadPendingTeamStatusUpdate,
  clearPendingTeamStatusUpdate,
  type RouteTrackingStorage,
} from './lib/trackingStorage';
import { updateTaskStatus, type Task } from './lib/tasks';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { fetchMe } from './lib/apiAuth';
import { apiFetch, setAuthToken } from './lib/apiClient';

function App() {
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [focusLocation, setFocusLocation] = useState<Location | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [mapMode, setMapMode] = useState<'lokasyon' | 'harita'>('lokasyon');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [detailsModalLocation, setDetailsModalLocation] = useState<Location | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'user' | 'editor' | 'viewer' | null>(null);

  const mainScrollRef = useRef<HTMLElement | null>(null);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Restore session from sessionStorage so refresh/back keeps login,
  // but closing the tab/app forces re-login.
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const goToLogin = useCallback((replace = true) => {
    try {
      navigate('/login', { replace });
    } catch {
      // ignore
    }
  }, [navigate]);

  // Admin Panel state
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isMesaiTrackingOpen, setIsMesaiTrackingOpen] = useState(false);
  const [isAcceptanceApprovalsOpen, setIsAcceptanceApprovalsOpen] = useState(false);
  const [isAssignedTasksAdminOpen, setIsAssignedTasksAdminOpen] = useState(false);
  const [pendingAcceptanceCount, setPendingAcceptanceCount] = useState<number>(0);
  const knownPendingAcceptanceIdsRef = useRef<Set<number>>(new Set());

  // In-app messages (user <-> admin). Opens from main sidebar.
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);

  const { locations, loading, error, updateLocation, createLocation, deleteLocation } = useLocations({
    enabled: !isAuthChecking && !!currentUser,
  });
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [activitiesBootstrapState, setActivitiesBootstrapState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [activitiesBootstrapError, setActivitiesBootstrapError] = useState<string | null>(null);
  const activitiesFetchInFlightRef = useRef(false);

  const canUseMessages = !!currentUser;

  // Unread message badge (admin + non-admin).
  useEffect(() => {
    if (!currentUser) {
      setUnreadMessagesCount(0);
      return;
    }

    let isCancelled = false;
    const isAdmin = userRole === 'admin';

    const refresh = async () => {
      try {
        if (isAdmin) {
          const res = await apiFetch('/messages/admin/unread-counts');
          if (isCancelled) return;
          const counts = ((res as any)?.data ?? {}) as Record<string, number>;
          const total = Object.values(counts).reduce((acc, v) => acc + (Number(v) || 0), 0);
          setUnreadMessagesCount(total);
          return;
        }

        const res = await apiFetch('/messages/unread-count');
        if (isCancelled) return;
        setUnreadMessagesCount(Number((res as any)?.data ?? 0));
      } catch {
        // ignore
      }
    };

    refresh();

    // Polling replacement for realtime updates.
    const id = window.setInterval(() => {
      refresh();
    }, 10_000);

    return () => {
      isCancelled = true;
      window.clearInterval(id);
    };
  }, [currentUser, userRole]);

  const refreshActivities = useCallback(async () => {
    if (activitiesFetchInFlightRef.current) return;
    activitiesFetchInFlightRef.current = true;

    try {
      const rows = await getActivities(200);
      const mapped = (rows || []).map((r: any) => ({
        id: String(r.id),
        user: String(r.username ?? ''),
        action: String(r.action ?? ''),
        time: String(r.created_at ?? ''),
        location_id: r.location_id != null ? String(r.location_id) : undefined,
        location_name: r.location_name != null ? String(r.location_name) : undefined,
        activity_type: r.activity_type != null ? String(r.activity_type) : undefined,
        duration_minutes: r.duration_minutes != null ? Number(r.duration_minutes) : undefined,
      }));

      setActivities(mapped as ActivityEntry[]);
      if (mapped.length > 0) setLastUpdated(mapped[0].time);
    } finally {
      activitiesFetchInFlightRef.current = false;
    }
  }, []);

  // Manual dismissal timestamps for the pulsing "recent work" highlight per region.
  // If a newer activity happens after dismissal, the pulse will automatically re-appear.
  const [dismissedWorkRegionAt, setDismissedWorkRegionAt] = useState<Record<number, number>>({});

  // Desktop sidebar UX: keep the nav within 100vh by collapsing heavy sections.
  const [activityFullscreenOpen, setActivityFullscreenOpen] = useState(false);
  // Desktop sidebar removed - all screens use unified header + bottom nav

  // Map locationId -> regionId for fast lookups
  const locationToRegionId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (locations || []) as any[]) {
      const rid = Number(r?.id);
      const regionLocs = (r?.locations || []) as any[];
      for (const l of regionLocs) {
        if (l?.id != null && Number.isFinite(rid)) m.set(String(l.id), rid);
      }
    }
    return m;
  }, [locations]);

  // Regions with recent work per user (last activity with location_id within 24h)
  const activeWorkRegionIds = useMemo(() => {
    const cutoffMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const latestByUser = new Map<string, ActivityEntry>();

    // activities are loaded sorted desc by created_at; first hit per user is the latest
    for (const a of activities) {
      if (!a?.location_id) continue;
      const u = String(a.user || '').trim();
      if (!u) continue;
      if (!latestByUser.has(u)) latestByUser.set(u, a);
    }

    // Track latest work timestamp per region (from per-user latest activity)
    const regionLatestMs = new Map<number, number>();
    latestByUser.forEach(a => {
      const t = a?.time ? new Date(a.time).getTime() : NaN;
      if (!Number.isFinite(t)) return;
      if (now - t > cutoffMs) return; // stop pulsing if user inactive > 24h
      const rid = locationToRegionId.get(String(a.location_id));
      if (rid == null || !Number.isFinite(rid)) return;
      const prev = regionLatestMs.get(rid);
      if (prev == null || t > prev) regionLatestMs.set(rid, t);
    });

    // Apply manual dismiss: suppress only if dismissal is newer than (or equal to) latest work time
    const out: number[] = [];
    regionLatestMs.forEach((t, rid) => {
      const dismissedAt = dismissedWorkRegionAt[rid];
      if (dismissedAt != null && dismissedAt >= t) return;
      out.push(rid);
    });
    return out;
  }, [activities, locationToRegionId, dismissedWorkRegionAt]);

  const dismissActiveWorkRegion = (regionId: number) => {
    if (!Number.isFinite(regionId)) return;
    setDismissedWorkRegionAt(prev => ({ ...prev, [regionId]: Date.now() }));
  };

  // Tasks
  const [isTasksPanelOpen, setIsTasksPanelOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Active route tracking state
  const [activeRoute, setActiveRoute] = useState<Location[] | null>(null);
  const [currentRouteIndex, setCurrentRouteIndex] = useState<number>(0);
  const [isTrackingRoute, setIsTrackingRoute] = useState<boolean>(false);
  
  // User's current location for distance calculation
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [geoPermissionDenied, setGeoPermissionDenied] = useState<boolean>(false);

  // Reduce perceived "reload/reset" by throttling GPS -> React state updates.
  // We still store the latest coordinate in a ref for background writes and other logic.
  const latestUserLocationRef = useRef<[number, number] | null>(null);
  const lastUiUserLocationRef = useRef<[number, number] | null>(null);
  const lastUiUserLocationUpdateAtRef = useRef<number>(0);

  const pushUserLocation = useCallback((lat: number, lng: number, opts?: { force?: boolean }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const next: [number, number] = [lat, lng];
    latestUserLocationRef.current = next;

    const now = Date.now();
    const force = !!opts?.force;

    // Update UI at most ~1/sec unless forced.
    if (!force && now - (lastUiUserLocationUpdateAtRef.current || 0) < 900) return;

    const prev = lastUiUserLocationRef.current;
    if (!force && prev && prev[0] === next[0] && prev[1] === next[1]) return;

    lastUiUserLocationUpdateAtRef.current = now;
    lastUiUserLocationRef.current = next;
    setUserLocation(next);
  }, []);

  // Persist lightweight UI state so if Android reloads the WebView, it doesn't feel like a fresh login.
  const UI_STATE_KEY = 'ui_state_v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(UI_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s.selectedRegion === 'number') setSelectedRegion(s.selectedRegion);
      if (s && (s.view === 'map' || s.view === 'list')) setView(s.view);
      if (s && (s.mapMode === 'lokasyon' || s.mapMode === 'harita')) setMapMode(s.mapMode);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          UI_STATE_KEY,
          JSON.stringify({
            selectedRegion,
            view,
            mapMode,
            savedAt: new Date().toISOString()
          })
        );
      } catch {
        // ignore
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [mapMode, selectedRegion, view]);

  // Initial work state for restoring from localStorage
  const [initialWorkState, setInitialWorkState] = useState<{ isWorking: boolean; workStartTime: Date | null } | undefined>(undefined);

  // Detailed tracking state
  const [completedLocations, setCompletedLocations] = useState<CompletedLocationInfo[]>([]);
  const [currentLegStartTime, setCurrentLegStartTime] = useState<Date | null>(null);
  const [totalTravelMinutes, setTotalTravelMinutes] = useState<number>(0);
  const [totalWorkMinutes, setTotalWorkMinutes] = useState<number>(0);
  const [todayCompletedCount, setTodayCompletedCount] = useState<number>(0);

  // Effective permissions (DB values override role defaults)
  const roleDefaults = useMemo(() => {
    const key = (currentUser?.role ?? userRole ?? 'user') as keyof typeof DEFAULT_PERMISSIONS;
    return DEFAULT_PERMISSIONS[key] ?? DEFAULT_PERMISSIONS.user;
  }, [currentUser?.role, userRole]);

  const userCanView = typeof currentUser?.can_view === 'boolean' ? currentUser.can_view : roleDefaults.can_view;
  const userCanEdit = typeof currentUser?.can_edit === 'boolean' ? currentUser.can_edit : roleDefaults.can_edit;
  const userCanCreate = typeof currentUser?.can_create === 'boolean' ? currentUser.can_create : roleDefaults.can_create;
  const userCanDelete = typeof currentUser?.can_delete === 'boolean' ? currentUser.can_delete : roleDefaults.can_delete;
  const userCanExport = typeof currentUser?.can_export === 'boolean' ? currentUser.can_export : roleDefaults.can_export;
  const userCanRoute = typeof currentUser?.can_route === 'boolean' ? currentUser.can_route : roleDefaults.can_route;
  const userCanTeamView = typeof currentUser?.can_team_view === 'boolean' ? currentUser.can_team_view : roleDefaults.can_team_view;
  const userCanManualGps = typeof (currentUser as any)?.can_manual_gps === 'boolean' ? (currentUser as any).can_manual_gps : (roleDefaults as any).can_manual_gps;

  // Manual GPS mode (permission-gated). When enabled, we stop using live GPS for proximity
  // and show the arrival swipe immediately.
  const [manualGpsMode, setManualGpsMode] = useState<boolean>(false);

  useEffect(() => {
    if (!userCanManualGps && manualGpsMode) setManualGpsMode(false);
  }, [userCanManualGps, manualGpsMode]);

  const currentTargetLocation = useMemo(() => {
    if (!activeRoute || activeRoute.length === 0) return null;
    const idx = Math.max(0, Math.min(currentRouteIndex, activeRoute.length - 1));
    return activeRoute[idx] ?? null;
  }, [activeRoute, currentRouteIndex]);

  const isRouteTestMode = useMemo(() => {
    try {
      return import.meta.env.VITE_ROUTE_TEST_MODE === '1' || localStorage.getItem('mapflow_route_test_mode') === '1';
    } catch {
      return import.meta.env.VITE_ROUTE_TEST_MODE === '1';
    }
  }, []);

  const { trackingState, confirmArrival, completeWork, resetTracking } = useLocationTracking({
    targetLocation: currentTargetLocation,
    userPosition: manualGpsMode ? null : userLocation,
    initialWorkState,
    testMode: isRouteTestMode
  });

  // Auto-confirm arrival in route test mode (after simulated proximity kicks in).
  const lastAutoArrivedLocationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTrackingRoute) {
      lastAutoArrivedLocationIdRef.current = null;
    }
  }, [isTrackingRoute]);

  const buildTrackingSnapshot = (): RouteTrackingStorage => {
    return {
      version: 2,
      userId: currentUser?.id ?? undefined,
      username: currentUser?.username ?? '',
      activeTaskId: activeTaskId ?? null,
      activeRoute,
      currentRouteIndex,
      isTrackingRoute,
      trackingState: {
        arrivalTime: trackingState.arrivalTime ? trackingState.arrivalTime.toISOString?.() ?? String(trackingState.arrivalTime) : null,
        isWorking: trackingState.isWorking,
        workStartTime: trackingState.workStartTime ? trackingState.workStartTime.toISOString?.() ?? String(trackingState.workStartTime) : null
      },
      currentLegStartTime: currentLegStartTime ? currentLegStartTime.toISOString() : null,
      completedLocations,
      totalTravelMinutes,
      totalWorkMinutes,
      todayCompletedCount,
      savedAt: new Date().toISOString()
    };
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    // Haversine distance in kilometers
    const toRad = (v: number) => v * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const trackingSnapshotRef = useRef<RouteTrackingStorage | null>(null);
  useEffect(() => {
    trackingSnapshotRef.current = buildTrackingSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentUser?.id,
    currentUser?.username,
    isTrackingRoute,
    activeRoute,
    currentRouteIndex,
    trackingState.isWorking,
    trackingState.workStartTime,
    currentLegStartTime,
    completedLocations,
    totalTravelMinutes,
    totalWorkMinutes,
    todayCompletedCount,
    activeTaskId
  ]);

  // Restore route state from database on mount (when user is logged in)
  useEffect(() => {
    const loadRouteFromDb = async () => {
      if (!currentUser) return;

      let localRestored = false;
      let localSnap: RouteTrackingStorage | null = null;

      // Fast local restore first (helps when mobile browser discards tab/offline)
      try {
        localSnap = loadTrackingState();
        const belongsToUser =
          !!localSnap &&
          localSnap.isTrackingRoute === true &&
          Array.isArray(localSnap.activeRoute) &&
          localSnap.activeRoute.length > 0 &&
          ((localSnap.userId && localSnap.userId === currentUser.id) || (!localSnap.userId && localSnap.username === currentUser.username));

        if (belongsToUser) {
          const local = localSnap as RouteTrackingStorage;
          const idx = Math.max(0, Math.min(local.currentRouteIndex || 0, (local.activeRoute?.length || 1) - 1));
          setActiveRoute(local.activeRoute as any);
          setCurrentRouteIndex(idx);
          setIsTrackingRoute(true);
          setActiveTaskId((local as any).activeTaskId ?? null);
          setCompletedLocations((local.completedLocations || []) as any);
          setCurrentLegStartTime(local.currentLegStartTime ? new Date(local.currentLegStartTime) : null);
          setTotalTravelMinutes(typeof local.totalTravelMinutes === 'number' ? local.totalTravelMinutes : 0);
          setTotalWorkMinutes(typeof local.totalWorkMinutes === 'number' ? local.totalWorkMinutes : 0);
          setTodayCompletedCount(typeof local.todayCompletedCount === 'number' ? local.todayCompletedCount : 0);

          setInitialWorkState({
            isWorking: !!local.trackingState?.isWorking,
            workStartTime: local.trackingState?.workStartTime ? new Date(local.trackingState.workStartTime) : null
          });

          const currentLoc = (local.activeRoute as any[])[idx] as any;
          if (currentLoc) setFocusLocation(currentLoc);

          localRestored = true;
        }
      } catch {
        // ignore local restore errors
      }
      
      try {
        console.log('Loading route from database for user:', currentUser.id);
        const routeData = await getUserRoute(currentUser.id);
        console.log('Route data from DB:', routeData);

        // If DB fetch failed (offline/network/server), do NOT clear local snapshot.
        // Keep whatever we could restore locally for maximum stability.
        if (!routeData) {
          console.log('Route fetch failed or unavailable; keeping local state if any');
          return;
        }
        
        if (routeData && routeData.activeRoute && Array.isArray(routeData.activeRoute) && routeData.activeRoute.length > 0) {
          console.log('Restoring route with', routeData.activeRoute.length, 'locations, index:', routeData.currentRouteIndex);

          // Merge DB + local snapshot defensively to avoid regressions.
          // DB is the source of truth, but local can be newer if the app was offline.
          const idsSig = (route: any[] | null | undefined) => {
            if (!Array.isArray(route)) return '';
            return route.map((r: any) => String(r?.id ?? '')).join(',');
          };

          const dbSig = idsSig(routeData.activeRoute as any);
          const localSig = idsSig(localSnap?.activeRoute as any);
          const routesMatch = !!dbSig && dbSig === localSig;

          const safeIndex = (() => {
            const n = routeData.activeRoute.length;
            const raw = typeof routeData.currentRouteIndex === 'number' ? routeData.currentRouteIndex : Number(routeData.currentRouteIndex);
            const idx = Number.isFinite(raw) ? raw : 0;
            return Math.max(0, Math.min(idx, n - 1));
          })();

          let mergedIndex = safeIndex;
          if (localRestored && routesMatch && typeof localSnap?.currentRouteIndex === 'number') {
            const n = routeData.activeRoute.length;
            mergedIndex = Math.max(0, Math.min(Math.max(safeIndex, localSnap.currentRouteIndex), n - 1));
          }

          const mergedCompleted = (() => {
            const db = Array.isArray(routeData.completedLocations) ? routeData.completedLocations : [];
            const local = Array.isArray(localSnap?.completedLocations) ? (localSnap!.completedLocations as any[]) : [];
            if (!localRestored || !routesMatch) return db;
            // Prefer the longer (more progress).
            return local.length > db.length ? (local as any) : db;
          })();

          setActiveRoute(routeData.activeRoute);
          setCurrentRouteIndex(mergedIndex);
          setIsTrackingRoute(true);
          // Restore work state
          if (routeData.isWorking !== undefined) {
            setInitialWorkState({
              isWorking: routeData.isWorking,
              workStartTime: routeData.workStartTime
            });
          }
          // Restore detailed tracking state
          setCompletedLocations(mergedCompleted || []);
          setCurrentLegStartTime(routeData.currentLegStartTime);
          setTotalTravelMinutes(routeData.totalTravelMinutes || 0);
          setTotalWorkMinutes(routeData.totalWorkMinutes || 0);
          setTodayCompletedCount(routeData.todayCompletedCount || 0);
          
          // Focus on current location
          const currentLoc = routeData.activeRoute[mergedIndex];
          if (currentLoc) {
            setFocusLocation(currentLoc);
          }

          // Keep local snapshot aligned with DB for maximum stability.
          const snap = trackingSnapshotRef.current;
          if (snap) {
            try { saveTrackingState(snap); } catch { /* ignore */ }
          }
        } else {
          console.log('No active route found for user');

          // DB explicitly says there is no active route; clear any stale local snapshot
          try { clearTrackingState(); } catch { /* ignore */ }

          // Restore today's stats even if no active route
          if (routeData) {
            setCompletedLocations(routeData.completedLocations || []);
            setTotalTravelMinutes(routeData.totalTravelMinutes || 0);
            setTotalWorkMinutes(routeData.totalWorkMinutes || 0);
            setTodayCompletedCount(routeData.todayCompletedCount || 0);
          }
          // Register editor users with idle status only if they don't have an active route
          if (userRole === 'editor') {
            await updateTeamStatus({
              userId: currentUser.id,
              username: currentUser.username,
              status: 'idle',
              totalRouteCount: 0,
              completedCount: 0
            });
          }
        }
      } catch (err) {
        console.error('Error loading route from database:', err);
      }
    };
    
    loadRouteFromDb();
  }, [currentUser, userRole]);

  const startRoute = async (route: Location[], taskId?: string | null) => {
    if (!currentUser || route.length === 0) return;

    const routeStartTime = new Date();
    setActiveRoute(route);
    setCurrentRouteIndex(0);
    setIsTrackingRoute(true);
    setCurrentLegStartTime(routeStartTime);
    setView('map');

    if (taskId) {
      setActiveTaskId(taskId);
      try { await updateTaskStatus(taskId, 'in_progress'); } catch { /* ignore */ }
    } else {
      setActiveTaskId(null);
    }

    notifyRouteStarted(currentUser.username, route.length);

    const firstLocation = route[0];
    const nextLocation = route.length > 1 ? route[1] : null;

    // Record that the user is "on the road" toward the first target
    try {
      await logActivity({
        username: currentUser.username,
        action: `Yola çıktı: ${firstLocation.name}`,
        location_id: String(firstLocation.id),
        location_name: firstLocation.name,
        activity_type: 'general'
      });
    } catch {
      // ignore
    }

    await updateTeamStatus({
      userId: currentUser.id,
      username: currentUser.username,
      status: 'yolda',
      currentLocationId: typeof firstLocation.id === 'number' ? firstLocation.id : parseInt(firstLocation.id) || null,
      currentLocationName: firstLocation.name,
      nextLocationName: nextLocation?.name ?? null,
      totalRouteCount: route.length,
      completedCount: 0,
      currentLat: userLocation?.[0] ?? null,
      currentLng: userLocation?.[1] ?? null,
      activeRoute: route,
      currentRouteIndex: 0,
      isWorking: false,
      workStartTime: null,
      currentLegStartTime: routeStartTime,
      completedLocations,
      totalTravelMinutes,
      totalWorkMinutes,
      todayCompletedCount
    });

    setFocusLocation(firstLocation);
    setSelectedLocation(firstLocation);
  };

  // Persist route snapshot locally as a safety net (DB is still the main source-of-truth).
  useEffect(() => {
    // Debounce to avoid frequent localStorage writes.
    const t = window.setTimeout(() => {
      const snap = trackingSnapshotRef.current;
      if (snap) {
        saveTrackingState(snap);
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    currentUser?.id,
    isTrackingRoute,
    activeRoute,
    currentRouteIndex,
    trackingState.isWorking,
    trackingState.workStartTime,
    currentLegStartTime,
    completedLocations,
    totalTravelMinutes,
    totalWorkMinutes,
    todayCompletedCount
  ]);

  // --- Robust DB sync for route/team status ---
  // Goal: closing the app / going offline should not "break" an active route.
  // We keep local snapshot for instant resume and periodically persist full state to DB.
  const fullTeamStatusInFlightRef = useRef(false);
  const lastFullTeamStatusHashRef = useRef<string>('');

  const activeRouteLen = activeRoute?.length ?? 0;
  const userLat = userLocation?.[0] ?? null;
  const userLng = userLocation?.[1] ?? null;

  const buildFullTeamStatusUpdate = useCallback(() => {
    if (!currentUser?.id || !currentUser?.username) return null;
    if (!isTrackingRoute) return null;
    if (activeRouteLen === 0 || !activeRoute) return null;

    const idx = Math.max(0, Math.min(currentRouteIndex || 0, activeRoute.length - 1));
    const currentLoc = activeRoute[idx];
    const nextLoc = idx + 1 < activeRoute.length ? activeRoute[idx + 1] : null;

    const derivedStatus = trackingState.isWorking ? 'adreste' : 'yolda';
    const completedCount = Array.isArray(completedLocations) ? completedLocations.length : 0;

    return {
      userId: String(currentUser.id),
      username: String(currentUser.username),
      status: derivedStatus as any,
      currentLocationId: currentLoc?.id != null ? (typeof (currentLoc as any).id === 'number' ? (currentLoc as any).id : parseInt(String((currentLoc as any).id)) || null) : null,
      currentLocationName: currentLoc?.name ?? null,
      nextLocationName: nextLoc?.name ?? null,
      totalRouteCount: activeRoute.length,
      completedCount,
      currentLat: userLat,
      currentLng: userLng,
      activeRoute: activeRoute as any,
      currentRouteIndex: idx,
      isWorking: !!trackingState.isWorking,
      workStartTime: trackingState.workStartTime ?? null,

      completedLocations: (completedLocations as any) ?? [],
      currentLegStartTime: currentLegStartTime ?? null,
      totalTravelMinutes: totalTravelMinutes ?? 0,
      totalWorkMinutes: totalWorkMinutes ?? 0,
      todayCompletedCount: todayCompletedCount ?? 0,
    };
  }, [
    activeRoute,
    activeRouteLen,
    completedLocations,
    currentLegStartTime,
    currentRouteIndex,
    currentUser?.id,
    currentUser?.username,
    isTrackingRoute,
    todayCompletedCount,
    totalTravelMinutes,
    totalWorkMinutes,
    trackingState.isWorking,
    trackingState.workStartTime,
    userLat,
    userLng,
  ]);

  const flushFullTeamStatusToDb = useCallback(async (opts?: { force?: boolean }) => {
    const payload = buildFullTeamStatusUpdate();
    if (!payload) return;

    const routeIds = Array.isArray((payload as any).activeRoute)
      ? (payload as any).activeRoute.map((r: any) => String(r?.id ?? '')).join(',')
      : '';
    const hash = JSON.stringify({
      routeIds,
      currentRouteIndex: (payload as any).currentRouteIndex,
      isWorking: (payload as any).isWorking,
      workStartTime: (payload as any).workStartTime ? String((payload as any).workStartTime) : null,
      completedCount: (payload as any).completedCount,
      totalTravelMinutes: (payload as any).totalTravelMinutes,
      totalWorkMinutes: (payload as any).totalWorkMinutes,
      todayCompletedCount: (payload as any).todayCompletedCount,
      currentLocationId: (payload as any).currentLocationId,
    });

    if (!opts?.force && lastFullTeamStatusHashRef.current === hash) return;
    if (fullTeamStatusInFlightRef.current) return;
    fullTeamStatusInFlightRef.current = true;

    try {
      const ok = await updateTeamStatus(payload as any);
      if (ok) {
        lastFullTeamStatusHashRef.current = hash;
        try { clearPendingTeamStatusUpdate(); } catch { /* ignore */ }
        return;
      }
    } catch {
      // fall through to pending save
    } finally {
      fullTeamStatusInFlightRef.current = false;
    }

    // Could not persist now -> store pending so it can be retried later.
    try {
      savePendingTeamStatusUpdate({
        version: 1,
        userId: String(currentUser?.id ?? ''),
        username: String(currentUser?.username ?? ''),
        payload,
        savedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  }, [buildFullTeamStatusUpdate, currentUser?.id, currentUser?.username]);

  const flushPendingTeamStatusIfAny = useCallback(async () => {
    const pending = loadPendingTeamStatusUpdate();
    if (!pending) return;
    if (!currentUser?.id || !currentUser?.username) return;
    if (String(pending.userId) !== String(currentUser.id)) return;

    try {
      const ok = await updateTeamStatus((pending as any).payload);
      if (ok) {
        try { clearPendingTeamStatusUpdate(); } catch { /* ignore */ }
        return;
      }
    } catch {
      // ignore
    }

    // Keep pending, but mark last tried.
    try {
      savePendingTeamStatusUpdate({
        ...pending,
        lastTriedAt: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  }, [currentUser?.id, currentUser?.username]);

  // Try flushing any pending update when user logs in.
  useEffect(() => {
    flushPendingTeamStatusIfAny();
  }, [flushPendingTeamStatusIfAny]);

  // Periodic full sync (route + index + stats) so DB is always close to current.
  useEffect(() => {
    if (!currentUser?.id) return;
    if (!isTrackingRoute) return;
    if (activeRouteLen === 0) return;

    const id = window.setInterval(() => {
      flushFullTeamStatusToDb();
    }, 15000);

    return () => window.clearInterval(id);
  }, [activeRouteLen, currentUser?.id, flushFullTeamStatusToDb, isTrackingRoute]);

  // Debounced sync on meaningful state changes (index/work/completions).
  useEffect(() => {
    if (!currentUser?.id) return;
    if (!isTrackingRoute) return;
    if (activeRouteLen === 0) return;

    const t = window.setTimeout(() => {
      flushFullTeamStatusToDb();
    }, 1200);

    return () => window.clearTimeout(t);
  }, [
    activeRouteLen,
    completedLocations?.length,
    currentLegStartTime,
    currentRouteIndex,
    currentUser?.id,
    flushFullTeamStatusToDb,
    isTrackingRoute,
    todayCompletedCount,
    totalTravelMinutes,
    totalWorkMinutes,
    trackingState.isWorking,
    trackingState.workStartTime,
  ]);

  // Flush on backgrounding / leaving and retry when back online.
  useEffect(() => {
    const onOnline = () => {
      flushPendingTeamStatusIfAny();
      flushFullTeamStatusToDb({ force: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // best-effort; don't await
        flushFullTeamStatusToDb({ force: true });
      }
    };

    const onPageHide = () => {
      flushFullTeamStatusToDb({ force: true });
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flushFullTeamStatusToDb, flushPendingTeamStatusIfAny]);

  // Tracking state is managed silently; local snapshot is saved to support resume

  // Uygulama açılışında (sadece native'de) tek seferlik konum izni iste
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    const isNativePlatform = platform !== 'web';
    if (!isNativePlatform) return;
    if (!navigator.geolocation) return;

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoPermissionDenied(false);
          pushUserLocation(position.coords.latitude, position.coords.longitude, { force: true });
        },
        (err: any) => {
          // Permission denied: avoid retry loops that keep prompting
          if (err && err.code === 1) {
            setGeoPermissionDenied(true);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0
        }
      );
    } catch {
      // Beklenmeyen hata olursa yoksay
    }
  }, [pushUserLocation]);

  // Get user's current location for distance calculations
  // Initial position on mount, then keep updating while route is active.
  // For smoother live tracking, prefer `watchPosition` during an active route.
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    const isNativePlatform = platform !== 'web';
    let isMounted = true;
    let watchId: number | null = null;

    const updateLocation = async () => {
      if (!isMounted) return;
      
      try {
        if (!navigator.geolocation) return;

        // If user denied location once on native, don't keep re-triggering prompts.
        if (isNativePlatform && geoPermissionDenied) return;

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (isMounted) {
              setGeoPermissionDenied(false);
              const newLocation: [number, number] = [position.coords.latitude, position.coords.longitude];
              pushUserLocation(newLocation[0], newLocation[1]);
            }
          },
          (err: any) => {
            if (isNativePlatform && err && err.code === 1) {
              setGeoPermissionDenied(true);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            // Keep this low so we get fresh-ish values for 500m detection
            maximumAge: 2000
          }
        );
      } catch {
        // Any unexpected error - ignore silently
      }
    };

    // Get initial location
    updateLocation();

    // During an active route, start a GPS watch for smoother updates.
    if (activeRoute && activeRoute.length > 0) {
      try {
        if (navigator.geolocation && !(isNativePlatform && geoPermissionDenied)) {
          watchId = navigator.geolocation.watchPosition(
            (position) => {
              if (!isMounted) return;
              setGeoPermissionDenied(false);
              pushUserLocation(position.coords.latitude, position.coords.longitude);
            },
            (err: any) => {
              if (isNativePlatform && err && err.code === 1) {
                setGeoPermissionDenied(true);
              }
            },
            {
              enableHighAccuracy: true,
              maximumAge: 2000,
              timeout: 8000
            }
          );
        }
      } catch {
        // ignore
      }
    }

    // Fallback: also refresh periodically so we don't stall on some devices.
    let intervalId: NodeJS.Timeout | null = null;
    if (activeRoute && activeRoute.length > 0) {
      intervalId = setInterval(() => {
        updateLocation();
      }, 10000);
    }

    return () => {
      isMounted = false;
      if (watchId != null && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
      }
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeRoute, geoPermissionDenied, pushUserLocation]);

  // Ensure native status bar does not overlay the WebView on Android/iOS
  useEffect(() => {
    try {
      if ((Capacitor as any).getPlatform && (Capacitor as any).getPlatform() !== 'web') {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      }
    } catch {
      // ignore if plugin not available in web/dev
    }
  }, []);

  // Bootstrap activities after auth is available.
  // Important: fetching only "on mount" fails on first login because auth token isn't set yet.
  const bootstrapActivities = useCallback(async () => {
    setActivitiesBootstrapState('loading');
    setActivitiesBootstrapError(null);
    try {
      await refreshActivities();
      setActivitiesBootstrapState('ready');
    } catch (e) {
      console.warn('load activities error', e);
      setActivitiesBootstrapState('error');
      setActivitiesBootstrapError('Aktivite geçmişi yüklenemedi. İnternet bağlantısını kontrol edip tekrar deneyin.');
    }
  }, [refreshActivities]);

  useEffect(() => {
    if (!currentUser?.id || userRole !== 'admin') {
      setActivitiesBootstrapState('idle');
      setActivitiesBootstrapError(null);
      return;
    }
    bootstrapActivities();
  }, [bootstrapActivities, currentUser?.id, userRole]);

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

  // Removed responsive detection - unified layout for all screens
  const showMobileHeader = true; // Always use unified header + bottom nav

  const refreshPendingAcceptanceCount = useCallback(async () => {
    if (!currentUser || userRole !== 'admin') {
      setPendingAcceptanceCount(0);
      return 0;
    }

    try {
      const list = await listPendingAcceptanceRequests();
      const next = Array.isArray(list) ? list.length : 0;
      setPendingAcceptanceCount(next);
      if (import.meta.env.DEV) console.debug('[acceptance badge] refreshed', { count: next });
      return next;
    } catch (e) {
      console.warn('refreshPendingAcceptanceCount failed', e);
      setPendingAcceptanceCount(0);
      return 0;
    }
  }, [currentUser, userRole]);

  // Admin: keep a badge count for pending acceptance requests and show notifications on new requests.
  useEffect(() => {
    if (!currentUser || userRole !== 'admin') {
      setPendingAcceptanceCount(0);
      return;
    }

    let cancelled = false;

    const refreshList = async () => {
      try {
        const list = await listPendingAcceptanceRequests();
        if (cancelled) return;
        setPendingAcceptanceCount(Array.isArray(list) ? list.length : 0);

        const prev = knownPendingAcceptanceIdsRef.current;
        const nextIds = new Set<number>();

        for (const r of list) {
          const id = Number((r as any)?.id);
          if (!Number.isFinite(id)) continue;
          nextIds.add(id);

          if (!prev.has(id)) {
            notifyAcceptanceRequest(
              String((r as any)?.locationName || 'Lokasyon'),
              String((r as any)?.requestedByUsername || 'Editör')
            );
          }
        }

        knownPendingAcceptanceIdsRef.current = nextIds;
      } catch (e) {
        if (!cancelled) {
          console.warn('refresh pending acceptance list failed', e);
          setPendingAcceptanceCount(0);
        }
      }
    };

    refreshList();

    // Polling replacement for realtime updates.
    const id = window.setInterval(() => {
      refreshList();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [currentUser, refreshPendingAcceptanceCount, userRole]);

  // Prevent hash anchors (e.g. Leaflet controls) from jumping scroll to top.
  // Also: preserve the main scroll container position across clicks, since some third-party
  // controls can cause an unexpected scroll reset.
  useEffect(() => {
    let lastWindowScrollY = 0;
    let lastMainScrollTop = 0;

    const captureScrollPositions = () => {
      lastWindowScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      lastMainScrollTop = mainScrollRef.current?.scrollTop ?? 0;
    };

    const clickHandlerCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.('a') as HTMLAnchorElement | null;
      const href = link?.getAttribute?.('href') || '';

      // When focusing/typing in a form field (especially on mobile with virtual keyboard),
      // the browser may legitimately adjust scroll. Our "restore" logic can fight that
      // and cause the view to jump away from the focused input.
      const activeEl = document.activeElement as HTMLElement | null;
      const activeTag = (activeEl?.tagName || '').toUpperCase();
      const isFormActive =
        !!activeEl &&
        (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT' || activeEl.isContentEditable);
      const isFormTarget =
        !!target &&
        !!(target.closest?.('input,textarea,select,[contenteditable="true"]') || target.closest?.('[contenteditable=""]'));
      if (isFormActive || isFormTarget) {
        // Still prevent hash anchors from jumping.
        if (href.startsWith('#')) e.preventDefault();
        return;
      }

      // Hash-only navigation ("#", "#close", etc) commonly scrolls the page to top.
      // Leaflet and some plugins use <a href="#..."> for controls.
      if (href.startsWith('#')) {
        e.preventDefault();
      }

      // If a click caused the app to unexpectedly jump to the top, restore the previous
      // scroll position on the next frame.
      requestAnimationFrame(() => {
        const main = mainScrollRef.current;
        if (main && lastMainScrollTop > 2 && main.scrollTop < 2) {
          main.scrollTop = lastMainScrollTop;
        }

        const currentWindowY = window.scrollY || document.documentElement.scrollTop || 0;
        if (lastWindowScrollY > 2 && currentWindowY < 2) {
          window.scrollTo({ top: lastWindowScrollY, left: 0, behavior: 'auto' });
        }
      });
    };

    // Capture phase is important: Leaflet may stop propagation on its controls.
    document.addEventListener('pointerdown', captureScrollPositions, true);
    document.addEventListener('click', clickHandlerCapture, true);

    return () => {
      document.removeEventListener('pointerdown', captureScrollPositions, true);
      document.removeEventListener('click', clickHandlerCapture, true);
    };
  }, []);

  // Desktop sidebar removed - unified layout
  useEffect(() => {
    if (!showMobileHeader) {
      setActivityFullscreenOpen(false);
    }
  }, [showMobileHeader]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const SESSION_KEY = 'app_session_v1';
        const PERSIST_KEY = 'app_session_persist_v1';

        const tryApplySession = (parsed: any) => {
          if (parsed?.token) {
            try { setAuthToken(String(parsed.token)); } catch { /* ignore */ }
          }
          if (parsed?.user && parsed?.role) {
            setCurrentUser(parsed.user);
            setUserRole(parsed.role);
          }
        };

        // 1) Prefer sessionStorage (default: no "remember me")
        const rawSession = sessionStorage.getItem(SESSION_KEY);
        if (rawSession) {
          const parsed = JSON.parse(rawSession);
          tryApplySession(parsed);
          return;
        }

        // 2) Fallback: 30-day "remember me" (localStorage with expiry)
        const rawPersist = localStorage.getItem(PERSIST_KEY);
        if (rawPersist) {
          const parsed = JSON.parse(rawPersist);
          const expiresAt = Number(parsed?.expiresAt ?? 0);
          if (!expiresAt || Date.now() > expiresAt) {
            try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
            return;
          }

          tryApplySession(parsed);

          // Mirror into sessionStorage for normal app flow.
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
              user: parsed?.user,
              role: parsed?.role,
              token: String(parsed?.token || ''),
            }));
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      } finally {
        setIsAuthChecking(false);
      }
    };
    restoreSession();
  }, []);

  // Keep current user's role & permissions in sync with DB so admin
  // permission changes are reflected without needing log out / log in.
  useEffect(() => {
    if (!currentUser) return;

    let isCancelled = false;

    const fetchLatestUser = async (notifyOnChange: boolean) => {
      try {
        const me = await fetchMe();
        const data = me?.user as any;
        if (isCancelled || !data) {
          return;
        }

        const changed =
          data.role !== currentUser.role ||
          data.can_view !== currentUser.can_view ||
          data.can_edit !== currentUser.can_edit ||
          data.can_create !== currentUser.can_create ||
          data.can_delete !== currentUser.can_delete ||
          data.can_export !== currentUser.can_export ||
          data.can_route !== currentUser.can_route ||
          data.can_team_view !== currentUser.can_team_view ||
          (data as any).can_manual_gps !== (currentUser as any).can_manual_gps;

        if (!changed) return;

        const nextUser: AuthUser = {
          id: data.id,
          username: data.username,
          role: data.role,
          full_name: data.full_name,
          email: data.email,
          can_view: data.can_view,
          can_edit: data.can_edit,
          can_create: data.can_create,
          can_delete: data.can_delete,
          can_export: data.can_export,
          can_route: data.can_route,
          can_team_view: data.can_team_view,
          can_manual_gps: (data as any).can_manual_gps
        };

        // Normalize role and update both state and localStorage session
        const r = String(nextUser.role || '').toLowerCase();
        const role = r === 'admin' ? 'admin' : (r === 'editor' ? 'editor' : (r === 'viewer' ? 'viewer' : 'user'));

        setCurrentUser(nextUser);
        setUserRole(role);
        try {
          const raw = sessionStorage.getItem('app_session_v1');
          const existing = raw ? JSON.parse(raw) : {};
          sessionStorage.setItem('app_session_v1', JSON.stringify({ ...existing, user: nextUser, role }));
        } catch {
          // ignore
        }

        // If a persistent "remember me" session exists, keep it in sync too.
        try {
          const rawPersist = localStorage.getItem('app_session_persist_v1');
          if (rawPersist) {
            const parsedPersist = JSON.parse(rawPersist);
            const expiresAt = Number(parsedPersist?.expiresAt ?? 0);
            if (expiresAt && Date.now() <= expiresAt) {
              localStorage.setItem('app_session_persist_v1', JSON.stringify({
                ...parsedPersist,
                user: nextUser,
                role,
              }));
            }
          }
        } catch {
          // ignore
        }

        if (notifyOnChange) {
          notifyPermissionsUpdated();
        }
      } catch (e) {
        console.warn('Failed to refresh user permissions from DB', e);
      }
    };

    // Initial check with notification enabled
    fetchLatestUser(true);

    // Periodic refresh without extra notifications (already synced)
    const intervalId = window.setInterval(() => {
      fetchLatestUser(false);
    }, 15000); // 15 seconds

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentUser]);

  // Mobile drawer state
  // Drawer removed - using bottom nav instead
  const [mobileSheet, setMobileSheet] = useState<'none' | 'management' | 'profile'>('none');
  const [statusFilters, setStatusFilters] = useState<Array<'active' | 'configured' | 'started' | 'installed' | 'installed_only' | 'accepted' | 'untouched' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'rtu' | 'rtu_installed' | 'rtu_todo'>>([]);

  // Team panel state
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  // Fullscreen live map overlay
  const [isLiveMapOpen, setIsLiveMapOpen] = useState(false);
  // Live-follow a team member on the in-app map (2s refresh)
  const [followMember, setFollowMember] = useState<{ id: string; username: string; lat: number; lng: number } | null>(null);

  // Keep a small ref so we don't spam updates with identical coords
  const lastTeamLocWriteRef = useRef<{ lat: number; lng: number } | null>(null);

  // Poll follow member location when following someone on main map
  useEffect(() => {
    if (!followMember?.id) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await apiFetch('/team-status');
        if (cancelled) return;
        const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];

        if (followMember?.id) {
          const found = rows.find((r: any) => String(r.user_id) === followMember.id);
          if (found?.current_lat != null && found?.current_lng != null) {
            setFollowMember(prev => {
              if (!prev) return prev;
              const nextLat = Number(found.current_lat);
              const nextLng = Number(found.current_lng);
              if (prev.lat === nextLat && prev.lng === nextLng) return prev;
              return { ...prev, lat: nextLat, lng: nextLng };
            });
          }
        }
      } catch {
        // ignore polling errors
      }
    };

    // immediate fetch + 2s interval
    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [followMember?.id]);

  // While a route is active, write the current GPS point into `team_status` frequently
  // so others can see smooth movement on the live map.
  useEffect(() => {
    if (!currentUser?.id || !currentUser?.username) return;
    if (activeRouteLen === 0) return;
    if (userLat == null || userLng == null) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (userLat == null || userLng == null) return;

      const lat = userLat;
      const lng = userLng;

      const prev = lastTeamLocWriteRef.current;
      if (prev && prev.lat === lat && prev.lng === lng) return;

      lastTeamLocWriteRef.current = { lat, lng };

      // Keep status fresh without re-sending full route payload.
      const derivedStatus = trackingState.isWorking ? 'adreste' : 'yolda';

      try {
        await updateTeamStatus({
          userId: String(currentUser.id),
          username: String(currentUser.username),
          status: derivedStatus as any,
          currentLat: lat,
          currentLng: lng,
        });
      } catch {
        // ignore
      }
    };

    // Immediate write + 2s loop
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    currentUser?.id,
    currentUser?.username,
    activeRouteLen,
    trackingState.isWorking,
    userLat,
    userLng
  ]);

  const currentRegion = locations.find(r => r.id === selectedRegion);
  const allLocations = useMemo(() => locations.flatMap(region => region.locations), [locations]);

  const [pendingTaskToStart, setPendingTaskToStart] = useState<Task | null>(null);

  const handleStartTask = async (task: Task) => {
    if (!currentUser) return;

    // If there is an existing active route, confirm overwrite (minimal UX)
    if (activeRoute && activeRoute.length > 0) {
      const ok = window.confirm('Mevcut rota devam ediyor. Görevi başlatmak için mevcut rotayı iptal etmek ister misiniz?');
      if (!ok) return;
      await handleCancelRoute();
    }

    // Redirect to the same optimized route builder flow (nearest-neighbor + 2-opt)
    setPendingTaskToStart(task);
    setIsTasksPanelOpen(false);
    setIsRouteModalOpen(true);
  };
  const currentLocations = selectedRegion === 0 ? allLocations : (currentRegion?.locations || []);



  // deployedCount and selectedDeployedCount removed (not used currently)

  // Export helpers
  const yn = (v: boolean | undefined | null) => (v ? 'Evet' : 'Hayır');
  const fmtNum = (v: unknown) => {
    if (v == null) return '';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(v);
  };

  const locationToExportRow = (loc: Location, region?: { id: number; name: string } | null) => {
    const eq = loc.details?.equipment;
    return {
      'Bölge Adı': region?.name ?? '',
      'İsim': loc.name,
      'Merkez': loc.center,

      'Marka': loc.brand,
      'Model': loc.model,
      'Etiketler': loc.details?.tags ?? '',

      'GPS Var': yn(loc.details?.hasGPS),
      'RTU Var': yn(loc.details?.hasRTU),
      'Pano Var': yn(loc.details?.hasPanos),

      'Devreye Alınmış': yn(loc.details?.isActive),
      'Konfigüre': yn(loc.details?.isConfigured),
      'Kabul Yapıldı': yn(loc.details?.isAccepted),
      'Montaj Yapıldı': yn(loc.details?.isInstalled),

      'Kartlı Geçiş': yn(loc.details?.hasCardAccess),
      'Kartlı Geçiş Devrede': yn(loc.details?.isActiveCardAccess),
      'Kartlı Geçiş Montaj': yn(loc.details?.isInstalledCardAccess),
      '2 Kapılı Kartlı Geçiş': yn(loc.details?.isTwoDoorCardAccess),

      'Transformatör Tipi': eq?.transformerCenterType ?? '',
      'Güvenlik Duvarı': fmtNum(eq?.securityFirewall),
      'Network Switch': fmtNum(eq?.networkSwitch),
      'RTU Sayısı': fmtNum(eq?.rtuCount),
      'GPS Kart/Anten': fmtNum(eq?.gpsCardAntenna),
      'RTU Panosu': fmtNum(eq?.rtuPanel),
      'BTP Panosu': fmtNum(eq?.btpPanel),
      'Enerji Analizörü': fmtNum(eq?.energyAnalyzer),
      'YKGC': fmtNum(eq?.ykgcCount),
      'TEİAŞ RTU Kurulum': fmtNum(eq?.teiasRtuInstallation),
      'İç Ortam Dome Kamera': fmtNum(eq?.indoorDomeCamera),
      'Ağ Video Yönetim': fmtNum(eq?.networkVideoManagement),
      'Akıllı Kontrol Ünitesi': fmtNum(eq?.smartControlUnit),
      'Kart Okuyucu': fmtNum(eq?.cardReader),
      'Ağ Kayıt Ünitesi': fmtNum(eq?.networkRecordingUnit),
      'Geçiş Kontrol Yazılımı': fmtNum(eq?.accessControlSystem)
    };
  };

  const handleExportExcel = async () => {
    try {
      const [XLSX, fileSaver] = await Promise.all([
        import('xlsx'),
        import('file-saver')
      ]);

      const saveAs: any = (fileSaver as any).saveAs;
      const utils: any = (XLSX as any).utils;
      const write: any = (XLSX as any).write;

      if (!utils || !write) {
        throw new Error('XLSX utils not available');
      }

      const wb = utils.book_new();

    if (selectedRegion === 0) {
      locations.forEach(region => {
        const rows = region.locations.map(loc => locationToExportRow(loc, { id: region.id, name: region.name }));
        const sheetName = `${region.id}. Bölge`;
        const ws = utils.json_to_sheet(rows);
        utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
      });
    } else {
      const rows = currentLocations.map(loc => locationToExportRow(loc, currentRegion ? { id: currentRegion.id, name: currentRegion.name } : null));
      const ws = utils.json_to_sheet(rows);
      utils.book_append_sheet(wb, ws, currentRegion ? `${currentRegion.id}. Bölge`.substring(0,31) : 'Lokasyonlar');
    }

    const excelArray: any = write(wb, { bookType: 'xlsx', type: 'array' });
    const excelBuffer: ArrayBuffer = excelArray instanceof ArrayBuffer ? excelArray : excelArray?.buffer;
    if (!excelBuffer) throw new Error('Could not create Excel buffer');

    const regionLabel = selectedRegion === 0 ? 'tum_bolgeler' : (currentRegion?.name ?? String(selectedRegion));
    const safeLabel = String(regionLabel).replace(/\s+/g, '_');
    // If running as native app use Capacitor filesystem + share, else fallback to file-saver
    if ((Capacitor as any).getPlatform && (Capacitor as any).getPlatform() !== 'web') {
      // write array buffer directly
      await saveArrayBufferAndShare(`lokasyonlar_${safeLabel}.xlsx`, excelBuffer);
    } else {
      if (typeof saveAs !== 'function') throw new Error('saveAs not available');
      saveAs(new Blob([excelBuffer], { type: 'application/octet-stream' }), `lokasyonlar_${safeLabel}.xlsx`);
    }
    } catch (err) {
      console.error('Excel export failed', err);
      alert('Excel dışa aktarımı sırasında hata oluştu.');
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

  const tryLoadPdfFont = async (doc: any) => {
    // Prefer an internet-hosted TTF (per request), but always keep a local fallback.
    // Inter has full Turkish glyph support.
    const remoteInterTtf = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/static/Inter-Regular.ttf';
    try {
      const res = await fetch(remoteInterTtf);
      if (!res.ok) throw new Error('Remote font not reachable');
      const buf = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const vfsKey = 'Inter-Regular.ttf';
      doc.addFileToVFS(vfsKey, base64);
      doc.addFont(vfsKey, 'Inter', 'normal');
      return 'Inter';
    } catch (e) {
      console.warn('Could not load remote Inter font, falling back to bundled DejaVuSans.ttf', e);
      return await tryLoadFont(doc, '/fonts/DejaVuSans.ttf');
    }
  };

  const pushActivity = async (user: string, action: string) => {
    const time = new Date().toISOString();
    
    // Determine activity_type based on action content
    const actionLower = action.toLowerCase();
    let detectedType: 'general' | 'login' | 'logout' | 'update' | 'create' | 'delete' | 'location' = 'general';
    if (actionLower.includes('giriş') || actionLower.includes('login')) {
      detectedType = 'login';
    } else if (actionLower.includes('çıkış') || actionLower.includes('logout')) {
      detectedType = 'logout';
    } else if (actionLower.includes('güncelle') || actionLower.includes('update')) {
      detectedType = 'update';
    } else if (actionLower.includes('oluştur') || actionLower.includes('create')) {
      detectedType = 'create';
    } else if (actionLower.includes('silindi') || actionLower.includes('delete')) {
      detectedType = 'delete';
    } else if (actionLower.includes('rota') || actionLower.includes('route') || actionLower.includes('konum') || actionLower.includes('varış') || actionLower.includes('tamamla')) {
      detectedType = 'location';
    }
    
    try {
      const inserted = await logActivity({ username: user, action, activity_type: detectedType });
      const entry: ActivityEntry = {
        id: String((inserted as any)?.id ?? crypto.randomUUID()),
        user,
        action,
        time: String((inserted as any)?.created_at ?? time),
        location_id: (inserted as any)?.location_id ? String((inserted as any).location_id) : undefined,
        location_name: (inserted as any)?.location_name ? String((inserted as any).location_name) : undefined,
        activity_type: (inserted as any)?.activity_type ? String((inserted as any).activity_type) as any : detectedType,
        duration_minutes: (inserted as any)?.duration_minutes != null ? Number((inserted as any).duration_minutes) : undefined,
      };
      // Use functional update to avoid clobbering a concurrently refreshed activities list.
      setActivities((prev) => [entry, ...(prev || [])].slice(0, 200));
      setLastUpdated(entry.time);
    } catch (e) {
      console.warn('pushActivity error', e);
    }
  };

  const handleLogout = async () => {
    try {
      if (currentUser) {
        try { await pushActivity(currentUser.username, 'Çıkış yaptı'); }
        catch (e) { console.warn('pushActivity failed on logout', e); }
      }
      try { clearTrackingState(); } catch { /* ignore */ }
      try { sessionStorage.removeItem('app_session_v1'); } catch { /* ignore */ }
      try { localStorage.removeItem('app_session_persist_v1'); } catch { /* ignore */ }
      try { setAuthToken(null); } catch { /* ignore */ }
      try { setMobileSheet('none'); } catch { /* ignore */ }
      try { setIsMessagesOpen(false); } catch { /* ignore */ }
    } finally {
      setUserRole(null);
      setCurrentUser(null);
      goToLogin(true);
    }
  };

  // Handle route cancellation - preserves completed locations and stats
  const handleCancelRoute = async () => {
    setActiveRoute(null);
    setCurrentRouteIndex(0);
    setCurrentLegStartTime(null);
    resetTracking();

    // If this route was started from a task, revert task back to assigned
    if (activeTaskId) {
      try { await updateTaskStatus(activeTaskId, 'assigned'); } catch { /* ignore */ }
      setActiveTaskId(null);
    }

    // Clear local snapshot so next launch doesn't resurrect a cancelled route
    try { clearTrackingState(); } catch { /* ignore */ }
    
    // Clear active route but preserve today's completed stats
    if (currentUser) {
      await clearTeamStatus(currentUser.id);
      pushActivity(currentUser.username, `Rota takibi iptal edildi (${todayCompletedCount} yer tamamlandı)`);
    }
  };

  // Handle arrival confirmation
  const handleArrivalConfirm = useCallback(async () => {
    if (!currentUser || !currentTargetLocation) return;
    
    const arrivalTime = new Date();
    
    // Calculate travel time from last leg
    let travelMinutes = 0;
    if (currentLegStartTime) {
      travelMinutes = calculateMinutesBetween(currentLegStartTime, arrivalTime);
      setTotalTravelMinutes(prev => prev + travelMinutes);
    }
    
    confirmArrival();
    
    // Send notification
    notifyArrival(currentTargetLocation.name);
    
    // Update team status to "adreste" (at address) - includes route data for database persistence
    if (activeRoute) {
      const nextLoc = currentRouteIndex + 1 < activeRoute.length ? activeRoute[currentRouteIndex + 1] : null;
      const workStartTime = new Date();
      await updateTeamStatus({
        userId: currentUser.id,
        username: currentUser.username,
        status: 'adreste',
        currentLocationId: typeof currentTargetLocation.id === 'number' ? currentTargetLocation.id : parseInt(currentTargetLocation.id) || null,
        currentLocationName: currentTargetLocation.name,
        nextLocationName: nextLoc?.name ?? null,
        totalRouteCount: activeRoute.length,
        completedCount: currentRouteIndex,
        currentLat: userLat,
        currentLng: userLng,
        activeRoute: activeRoute,
        currentRouteIndex: currentRouteIndex,
        isWorking: true,
        workStartTime: workStartTime,
        totalTravelMinutes: totalTravelMinutes + travelMinutes,
        completedLocations: completedLocations
      });
    }
    
    // Log arrival to database
    await logArrival(
      currentUser.username,
      currentTargetLocation.id,
      currentTargetLocation.name,
      arrivalTime,
      travelMinutes
    );

    // Refresh activities
    try {
      await refreshActivities();
    } catch {
      // ignore
    }
  }, [
    activeRoute,
    completedLocations,
    confirmArrival,
    currentLegStartTime,
    currentRouteIndex,
    currentTargetLocation,
    currentUser,
    refreshActivities,
    totalTravelMinutes,
    userLat,
    userLng,
  ]);

  // Route test mode: once we are "near" (simulated), auto-confirm arrival.
  useEffect(() => {
    if (!isRouteTestMode) return;
    if (!isTrackingRoute) return;
    if (!currentTargetLocation) return;
    if (!trackingState.isNearby) return;
    if (trackingState.isWorking) return;

    const key = String(currentTargetLocation.id);
    if (lastAutoArrivedLocationIdRef.current === key) return;
    lastAutoArrivedLocationIdRef.current = key;

    // Fire and forget; this updates team status + logs arrival.
    handleArrivalConfirm().catch(() => {
      // ignore
    });
  }, [
    isRouteTestMode,
    isTrackingRoute,
    currentTargetLocation,
    trackingState.isNearby,
    trackingState.isWorking,
    handleArrivalConfirm
  ]);

  // Handle completion confirmation
  const handleCompletionConfirm = async () => {
    if (!currentUser || !currentTargetLocation) return;
    const result = completeWork();
    if (!result) return;

    const endTime = new Date();
    const workMinutes = result.duration;
    
    // Calculate travel time for this location (time between route start or last completion and arrival)
    const travelMinutesForThisLeg = currentLegStartTime && result.startTime 
      ? calculateMinutesBetween(currentLegStartTime, result.startTime)
      : 0;
    
    // Add to completed locations list
    const completedLocationInfo: CompletedLocationInfo = {
      id: currentTargetLocation.id,
      name: currentTargetLocation.name,
      arrivedAt: result.startTime.toISOString(),
      completedAt: endTime.toISOString(),
      workDurationMinutes: workMinutes,
      travelDurationMinutes: travelMinutesForThisLeg
    };
    
    const updatedCompletedLocations = [...completedLocations, completedLocationInfo];
    setCompletedLocations(updatedCompletedLocations);
    setTotalWorkMinutes(prev => prev + workMinutes);
    setTodayCompletedCount(prev => prev + 1);
    
    // Send notification
    notifyCompletion(currentTargetLocation.name, result.duration);
    
    // Log completion to database
    try {
      await logCompletion(
        currentUser.username,
        currentTargetLocation.id,
        currentTargetLocation.name,
        result.startTime,
        endTime,
        result.duration
      );
    } catch (e) {
      // Activity logs are non-critical; never block completion flow.
      console.warn('activities insert failed (logCompletion)', e);
    }

    // Mesai source-of-truth: write a dedicated work entry (travel + work)
    try {
      const departedAtIso = currentLegStartTime
        ? currentLegStartTime.toISOString()
        : (travelMinutesForThisLeg > 0
          ? new Date(result.startTime.getTime() - travelMinutesForThisLeg * 60000).toISOString()
          : null);

      const ok = await logWorkEntry({
        userId: String(currentUser.id),
        username: currentUser.username,
        locationId: String(currentTargetLocation.id),
        locationName: currentTargetLocation.name,
        departedAt: departedAtIso,
        arrivedAt: result.startTime.toISOString(),
        completedAt: endTime.toISOString(),
        travelMinutes: travelMinutesForThisLeg,
        workMinutes: workMinutes
      });

      if (!ok) {
        console.warn('work_entries insert failed (logWorkEntry returned false)');
      }
    } catch (e) {
      console.warn('work_entries insert exception', e);
    }

    // Editor completion -> request admin acceptance approval for this location.
    if (userRole === 'editor') {
      try {
        await createAcceptanceRequest({
          locationId: String(currentTargetLocation.id),
          locationName: currentTargetLocation.name,
          requestedByUserId: String(currentUser.id),
          requestedByUsername: currentUser.username
        });
      } catch {
        // ignore
      }
    }

    // Move to next location in route
    if (activeRoute && currentRouteIndex < activeRoute.length - 1) {
      const nextIndex = currentRouteIndex + 1;
      const nextLocation = activeRoute[nextIndex];
      setCurrentRouteIndex(nextIndex);
      
      // Set leg start time for next location (for travel time calculation)
      const legStartTime = new Date();
      setCurrentLegStartTime(legStartTime);
      
      // Notify about next location
      notifyNextLocation(nextLocation.name, nextIndex + 1, activeRoute.length);

      // Record that the user is "on the road" toward the next target
      try {
        await logActivity({
          username: currentUser.username,
          action: `Yola çıktı: ${nextLocation.name}`,
          location_id: String(nextLocation.id),
          location_name: nextLocation.name,
          activity_type: 'general'
        });
      } catch {
        // ignore
      }
      
      // Update team status: moving to next location (includes route data)
      const futureNext = nextIndex + 1 < activeRoute.length ? activeRoute[nextIndex + 1] : null;
      await updateTeamStatus({
        userId: currentUser.id,
        username: currentUser.username,
        status: 'yolda',
        currentLocationId: typeof nextLocation.id === 'number' ? nextLocation.id : parseInt(nextLocation.id) || null,
        currentLocationName: nextLocation.name,
        nextLocationName: futureNext?.name ?? null,
        totalRouteCount: activeRoute.length,
        completedCount: nextIndex,
        currentLat: userLocation?.[0] ?? null,
        currentLng: userLocation?.[1] ?? null,
        activeRoute: activeRoute,
        currentRouteIndex: nextIndex,
        isWorking: false,
        workStartTime: null,
        completedLocations: updatedCompletedLocations,
        currentLegStartTime: legStartTime,
        totalTravelMinutes: totalTravelMinutes,
        totalWorkMinutes: totalWorkMinutes + workMinutes,
        todayCompletedCount: todayCompletedCount + 1
      });
    } else {
      // Route completed
      notifyRouteCompleted();
      setIsTrackingRoute(false);
      setActiveRoute(null);
      setCurrentRouteIndex(0);
      setCurrentLegStartTime(null);
      resetTracking();

      if (activeTaskId) {
        try { await updateTaskStatus(activeTaskId, 'completed'); } catch { /* ignore */ }
        setActiveTaskId(null);
      }
      
      // Update with final stats before clearing route
      await updateTeamStatus({
        userId: currentUser.id,
        username: currentUser.username,
        status: 'idle',
        totalRouteCount: 0,
        completedCount: 0,
        completedLocations: updatedCompletedLocations,
        totalTravelMinutes: totalTravelMinutes,
        totalWorkMinutes: totalWorkMinutes + workMinutes,
        todayCompletedCount: todayCompletedCount + 1
      });
      
      // Clear active route but preserve stats
      await clearTeamStatus(currentUser.id);

      // Clear local snapshot now that the route is finished
      try { clearTrackingState(); } catch { /* ignore */ }
    }

    // Refresh activities
    try {
      await refreshActivities();
    } catch {
      // ignore
    }
  };

  // Tab visibility / beforeunload: do not touch state when tab comes back,
  // and logouts are handled explicitly by user action only.
  useEffect(() => {
    const onBeforeUnload = () => {
      // Persist a local snapshot so refresh/tab discard can resume cleanly
      const snap = trackingSnapshotRef.current;
      if (snap) {
        try { saveTrackingState(snap); } catch { /* ignore */ }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      const snap = trackingSnapshotRef.current;
      if (snap) {
        try { saveTrackingState(snap); } catch { /* ignore */ }
      }
    };

    const onPageHide = () => {
      const snap = trackingSnapshotRef.current;
      if (snap) {
        try { saveTrackingState(snap); } catch { /* ignore */ }
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // Auto-logout is disabled; idle tracking and visibility handlers are completely removed
  // to prevent any state resets or logout triggers when switching tabs or backgrounding the app.

  const handleExportPDF = async () => {
    // Lazy-load PDF libs so they don't bloat startup bundles (and reduce memory pressure on iOS).
    let jsPDFCtor: any;
    let autoTableFn: any;
    try {
      const [jspdfMod, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      jsPDFCtor = (jspdfMod as any).jsPDF ?? (jspdfMod as any).default;
      autoTableFn = (autoTableMod as any).default ?? (autoTableMod as any).autoTable ?? autoTableMod;
      if (!jsPDFCtor || typeof jsPDFCtor !== 'function') throw new Error('jsPDF not available');
      if (!autoTableFn || typeof autoTableFn !== 'function') throw new Error('autoTable not available');
    } catch (err) {
      console.error('PDF libs failed to load', err);
      alert('PDF dışa aktarımı başlatılamadı.');
      return;
    }

    // A4 portrait with vertical layout (one location as key/value rows) so everything fits on printouts.
    const doc: any = new jsPDFCtor({ unit: 'pt', format: 'a4', orientation: 'portrait' });

    try {
      // Prefer internet font, fallback to bundled font
      const loadedFont = await tryLoadPdfFont(doc);
      if (loadedFont) {
        doc.setFont(loadedFont, 'normal');
      }

      const pageMargins = { left: 28, right: 28, top: 36, bottom: 32 };

      const innerPageWidth = doc.internal.pageSize.getWidth() - pageMargins.left - pageMargins.right;

      // 2-column key/value layout (Alan/Değer | Alan/Değer) so a full location fits on one A4 page.
      const keyColWidth = 120;
      const valueColWidth = Math.max(140, Math.floor((innerPageWidth - 2 * keyColWidth) / 2));

      const commonAutoTableOpts: any = {
        startY: pageMargins.top + 24,
        margin: { left: pageMargins.left, right: pageMargins.right },
        tableWidth: innerPageWidth,
        headStyles: {
          fillColor: [43, 108, 176],
          textColor: 255,
          // Use normal to avoid missing-bold fallback font issues
          fontStyle: 'normal',
          font: loadedFont || undefined,
          halign: 'top',
          valign: 'top',
          overflow: 'linebreak',
          fontSize: 11
        },
        styles: {
          font: loadedFont || undefined,
          fontSize: 9,
          cellPadding: 4,
          overflow: 'linebreak',
          valign: 'left'
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: keyColWidth },
          1: { cellWidth: valueColWidth },
          2: { cellWidth: keyColWidth },
          3: { cellWidth: valueColWidth }
        },
        tableLineWidth: 0,
        tableLineColor: 200
      };

      const headerTitle = selectedRegion === 0 ? 'Tüm Bölgeler' : `${currentRegion?.id}. Bölge`;

      const addHeaderAndFooter = () => {
        return (_data: any) => {
          const pageWidth = doc.internal.pageSize.getWidth();

          // Header: only title centered at top
          doc.setFontSize(14);
          if (loadedFont) doc.setFont(loadedFont, 'normal');
          doc.setTextColor(30);
          doc.text(headerTitle, pageWidth / 2, 24, { align: 'center' });

          // Footer
          const pageNumber = doc.internal.getCurrentPageInfo ? doc.internal.getCurrentPageInfo().pageNumber : doc.internal.getCurrentPageInfo?.().pageNumber;
          const totalPages = doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : undefined;
          doc.setFontSize(9);
          const footerText = totalPages ? `Sayfa ${pageNumber} / ${totalPages}` : `Sayfa ${pageNumber}`;
          doc.setTextColor(120);
          doc.text(footerText, pageWidth - pageMargins.right, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
        };
      };

      const columnsKv = [
        { header: 'Alan', dataKey: 'k1' },
        { header: 'Değer', dataKey: 'v1' },
        { header: 'Alan', dataKey: 'k2' },
        { header: 'Değer', dataKey: 'v2' }
      ];

      const pairsForLocation = (loc: Location, region: { id: number; name: string } | null) => {
        const row = locationToExportRow(loc, region);
        const entries = Object.entries(row);
        return entries.map(([k, v]) => ({ k, v: v == null ? '' : String(v) }));
      };

      const renderRegion = (region: { id: number; name: string } | null, list: Location[]) => {
        // We intentionally do not render a separate "region intro" table.

        for (let idx = 0; idx < list.length; idx++) {
          const loc = list[idx];
          if (idx > 0) doc.addPage();

          const flat = [
            { k: 'Lokasyon', v: `${idx + 1}/${list.length} - ${loc.name}` },
            ...pairsForLocation(loc, region)
          ];

          const body: Array<{ k1: string; v1: string; k2: string; v2: string }> = [];
          for (let i = 0; i < flat.length; i += 2) {
            const a = flat[i];
            const b = flat[i + 1];
            body.push({
              k1: a?.k ?? '',
              v1: a?.v ?? '',
              k2: b?.k ?? '',
              v2: b?.v ?? ''
            });
          }

          // Make the table fill the page height (single page per location).
          // We compute a minimum row height based on available vertical space.
          const pageHeight = doc.internal.pageSize.getHeight();
          const footerReserve = 18; // keep clear of footer text
          const availableHeight = Math.max(
            0,
            pageHeight - pageMargins.bottom - footerReserve - commonAutoTableOpts.startY
          );
          const rowCount = Math.max(1, body.length);
          // Include header row in the distribution.
          const targetRowHeight = Math.round(availableHeight / (rowCount + 1));
          // Allow more vertical fill when there are fewer rows.
          const minRowHeight = Math.max(12, Math.min(44, targetRowHeight));

          autoTableFn(doc as any, {
            ...commonAutoTableOpts,
            columns: columnsKv,
            body,
            didDrawPage: addHeaderAndFooter(),
            startY: commonAutoTableOpts.startY,
            didParseCell: (data: any) => {
              // Force a minimum row height to reduce empty space.
              if (data?.cell?.styles) {
                data.cell.styles.minCellHeight = Math.max(data.cell.styles.minCellHeight || 0, minRowHeight);
              }
            }
          });
        }
      };

      if (selectedRegion === 0) {
        for (let i = 0; i < locations.length; i++) {
          const region = locations[i];
          if (!region.locations || region.locations.length === 0) continue;
          if (i > 0) doc.addPage();
          renderRegion({ id: region.id, name: region.name }, region.locations);
        }
      } else {
        renderRegion(currentRegion ? { id: currentRegion.id, name: currentRegion.name } : null, currentLocations);
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
    setDetailsModalLocation(location);
    setIsDetailsModalOpen(true);
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

  // If a user loses view permission, ensure we don't keep a previously-selected region.
  useEffect(() => {
    if (!userCanView) {
      try { setSelectedRegion(0); } catch { /* ignore */ }
    }
  }, [userCanView]);

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
      } catch {
        // ignore if modal state isn't available
      }
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

  const needsActivitiesBootstrap = !!currentUser && userRole === 'admin' && activitiesBootstrapState !== 'ready';

  if (needsActivitiesBootstrap && activitiesBootstrapState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-red-500 mb-4 text-2xl">⚠️</div>
          <p className="text-red-600 mb-4">{activitiesBootstrapError || 'Aktivite geçmişi yüklenemedi.'}</p>
          <button
            type="button"
            onClick={() => bootstrapActivities()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (loading || isAuthChecking || needsActivitiesBootstrap) {
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

  const canViewLiveMap = userRole === 'admin';

  return (
    <>
      <VersionChecker />
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={async (user, token, rememberMe) => {
        // Accept 'admin', 'editor', 'viewer' (case-insensitive) or default to 'user'
        const r = String(user.role || '').toLowerCase();
        const role = r === 'admin' ? 'admin' : (r === 'editor' ? 'editor' : (r === 'viewer' ? 'viewer' : 'user'));
        // Ensure auth token is stored before any post-login API calls (activities, etc.)
        try { if (token) setAuthToken(String(token)); } catch { /* ignore */ }
        setUserRole(role);
        setCurrentUser(user);
        // persist session
        try { sessionStorage.setItem('app_session_v1', JSON.stringify({ user, role, token: String(token || '') })); } catch { /* ignore */ }
        // optional: remember for 30 days
        try {
          if (rememberMe) {
            const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
            localStorage.setItem('app_session_persist_v1', JSON.stringify({ user, role, token: String(token || ''), expiresAt }));
          } else {
            localStorage.removeItem('app_session_persist_v1');
          }
        } catch { /* ignore */ }
        pushActivity(user.username, 'Giriş yaptı');

        // Explicitly bootstrap activities after login.
        // This covers the case where the user logs in again as the same user (currentUser.id unchanged)
        // and the effect that depends on `currentUser?.id` would not re-run.
        if (role === 'admin') {
          try { bootstrapActivities(); } catch { /* ignore */ }
        }
        
        // For editor users, route restoration happens automatically via useEffect on currentUser change
        // We don't set idle status here to avoid overwriting any existing active route
      }} />} />
      <Route path="/*" element={
        <RequireAuth>
          <div className="min-h-screen flex flex-col bg-gray-50">

            {/* Fullscreen Activity History (admin) */}
            {userRole === 'admin' && activityFullscreenOpen && (
              <div className="fixed inset-0 z-[1400] bg-gray-50">
                <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4">
                  <div className="text-sm font-semibold text-gray-800">Aktivite Geçmişi</div>
                  <button
                    type="button"
                    onClick={() => setActivityFullscreenOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Kapat
                  </button>
                </div>
                <div className="h-[calc(100vh-3.5rem)] overflow-auto bg-gray-50 p-4">
                  <div className="max-w-5xl mx-auto h-full">
                    <ActivityWidget
                      inline={true}
                      fullHeight={true}
                      lastUpdated={lastUpdated}
                      activities={activities}
                      onOpenLocation={(name) => {
                        openLocationByName(name);
                        setActivityFullscreenOpen(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0 flex flex-col h-full">
              {/* Unified header for all screen sizes */}
              <header className="fixed inset-x-0 top-0 z-[1000] bg-white shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                {/* Main Header Row */}
                <div className="w-full px-3 sm:px-4 border-b border-gray-200">
                  <div className="flex items-center justify-between gap-3 sm:gap-4 h-14">
                    {/* Left: Logo + Brand */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-0.5 shadow-md">
                        <img src="/cartiva.png" alt="Cartiva" className="w-full h-full rounded-lg object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-base font-bold text-gray-900 leading-none">Cartiva</span>
                        <span className="text-[10px] text-gray-500 font-medium">Saha Yönetim</span>
                      </div>
                    </div>

                    {/* Center: Region Selector */}
                    {userCanView && (
                      <div className="hidden sm:flex flex-1 justify-center min-w-0 max-w-xs">
                        <div className="w-full min-w-0">
                          <RegionSelector selectedRegion={selectedRegion} onRegionChange={setSelectedRegion} />
                        </div>
                      </div>
                    )}

                    {/* Right: User Avatar */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-md">
                        {(currentUser?.username ?? 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="hidden lg:flex flex-col min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate leading-none">
                          {currentUser?.username ?? 'Kullanıcı'}
                        </div>
                        <div className="text-[10px] text-gray-500 font-medium">
                          {userRole === 'admin' ? 'Yönetici' : userRole === 'editor' ? 'Editör' : userRole === 'viewer' ? 'İzleyici' : 'Kullanıcı'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scrolling Ticker Bar - TEİAŞ style */}
                <div className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-blue-600 overflow-hidden">
                  <div className="flex items-center h-10 gap-6" style={{
                    animation: 'scroll-left 30s linear infinite',
                  }}>
                    <style dangerouslySetInnerHTML={{
                      __html: `
                        @keyframes scroll-left {
                          0% { transform: translateX(0); }
                          100% { transform: translateX(-50%); }
                        }
                      `
                    }} />
                    {/* Duplicate content for seamless loop */}
                    {[1, 2].map((loop) => (
                      <div key={loop} className="flex items-center gap-6 shrink-0">
                        <div className="flex items-center gap-2 text-white">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-xs font-semibold whitespace-nowrap">Toplam Lokasyon: {allLocations.length}</span>
                        </div>
                        <div className="w-px h-5 bg-blue-400" />
                        <div className="flex items-center gap-2 text-white">
                          <span className="text-xs font-semibold whitespace-nowrap">Seçili Bölge: {selectedRegion === 0 ? 'Tüm Bölgeler' : (locations.find(r => r.id === selectedRegion)?.name || '—')}</span>
                        </div>
                        <div className="w-px h-5 bg-blue-400" />
                        {userCanView && (
                          <>
                            <div className="flex items-center gap-2 text-white scale-90">
                              <WeatherWidget selectedRegion={selectedRegion} regions={locations} variant="inline" />
                            </div>
                            <div className="w-px h-5 bg-blue-400" />
                          </>
                        )}
                        <div className="flex items-center gap-2 text-white">
                          <span className="text-xs font-semibold">Bugün: {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <div className="w-px h-4 bg-blue-400" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mobile Region Selector Row */}
                {userCanView && (
                  <div className="sm:hidden w-full px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <RegionSelector selectedRegion={selectedRegion} onRegionChange={setSelectedRegion} />
                  </div>
                )}
              </header>

              {/* Drawer removed - using bottom nav instead */}

            {/* main: unified padding for header + bottom nav */}
            <main
              ref={mainScrollRef}
              className="pt-16 pb-24 flex-1 overflow-y-auto w-full px-4 sm:px-6 lg:px-8"
              style={{ 
                paddingTop: userCanView ? 'calc(3.5rem + 2.5rem + 2.5rem + env(safe-area-inset-top))' : 'calc(3.5rem + 2.5rem + env(safe-area-inset-top))'
              }}
            >
              {userCanView && (
                <div className="mb-4">
                  <div className="grid grid-cols-1 gap-4">
                    <LocationStats locations={allLocations} selectedRegionLocations={currentLocations} />
                  </div>
                </div>
              )}

              {/* Content */}
              {userCanView ? (
                view === 'map' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-end">
                      <div className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => setMapMode('lokasyon')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            mapMode === 'lokasyon'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Lokasyon modu
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapMode('harita')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            mapMode === 'harita'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Harita modu
                        </button>
                      </div>
                    </div>

                    <div
                      className="bg-slate-900 rounded-t-lg shadow-xl border border-slate-700 w-full overflow-hidden"
                      style={{ minHeight: 'calc(var(--vh, 1vh) * 40)' }}
                    >
                      <div className="map-responsive w-full">
                        <MapComponent
                          regions={locations}
                          locations={currentLocations}
                          selectedRegion={selectedRegion}
                          activeWorkRegionIds={activeWorkRegionIds}
                          onDismissActiveWorkRegion={dismissActiveWorkRegion}
                          onLocationSelect={handleLocationSelect}
                          onRegionSelect={(id) => setSelectedRegion(id)}
                          focusLocation={focusLocation}
                          setFocusLocation={setFocusLocation}
                          activeRoute={activeRoute}
                          currentRouteIndex={currentRouteIndex}
                          userLocation={userLocation}
                          calculateDistance={calculateDistance}
                          followMemberLocation={followMember}
                          useInlineSvg={mapMode === 'lokasyon'}
                          viewRestricted={!userCanView}
                          hideSummaryOverlay={true}
                        />
                      </div>
                    </div>

                    {/* Resmi Kabul Oranı (haritanın altında sabit) */}
                    <div className="bg-white rounded-b-lg shadow-md border border-gray-200 border-t-0 px-3 py-3">
                      {(() => {
                        const normalizeDirectorateField = (value: unknown) => String(value ?? '').trim().toUpperCase();
                        const isDirectorateLocation = (l: any) =>
                          normalizeDirectorateField(l?.brand) === 'BÖLGE' &&
                          normalizeDirectorateField(l?.model) === 'MÜDÜRLÜK';

                        const progressLocations = (currentLocations || []).filter(l => !isDirectorateLocation(l));

                        const totalShown = progressLocations.length;
                        const acceptedCount = progressLocations.filter(l => !!l.details && !!l.details.isAccepted).length;
                        const installedCount = progressLocations.filter(
                          l => !!l.details && !l.details.isAccepted && !!l.details.isInstalled,
                        ).length;
                        const startedCount = progressLocations.filter(
                          l => !!l.details && !l.details.isAccepted && !l.details.isInstalled && !!l.details.isConfigured,
                        ).length;
                        const untouchedCount = Math.max(0, totalShown - acceptedCount - installedCount - startedCount);

                        const acceptedPercent = totalShown > 0 ? Math.round((acceptedCount / totalShown) * 100) : 0;
                        const installedPercent = totalShown > 0 ? Math.round((installedCount / totalShown) * 100) : 0;
                        const startedPercent = totalShown > 0 ? Math.round((startedCount / totalShown) * 100) : 0;
                        const untouchedPercent = totalShown > 0 ? Math.round((untouchedCount / totalShown) * 100) : 0;

                        const summaryColor = totalShown > 0 ? '#22c55e' : '#64748b';

                        return (
                          <div className="w-full">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-base sm:text-lg font-bold text-gray-800">Resmi Kabul Oranı</div>
                              <div className="text-lg sm:text-xl font-bold" style={{ color: summaryColor }}>
                                {acceptedPercent}%
                              </div>
                            </div>

                            <div className="mt-2 h-2 bg-gray-200 rounded overflow-hidden" aria-hidden>
                              <div className="h-full transition-all" style={{ width: `${acceptedPercent}%`, background: summaryColor }} />
                            </div>

                            <div className="mt-2 text-sm text-gray-600">{acceptedCount} / {totalShown} lokasyon</div>

                            <div className="mt-3 grid grid-cols-1 gap-2">
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded" style={{ background: '#22c55e' }} />
                                <span className="text-sm text-gray-700">Kabul Edildi — {acceptedCount} ({acceptedPercent}%)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded" style={{ background: '#3b82f6' }} />
                                <span className="text-sm text-gray-700">Kurulum Tamam (Kabul Bekliyor) — {installedCount} ({installedPercent}%)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded" style={{ background: '#f59e0b' }} />
                                <span className="text-sm text-gray-700">Başlandı (Ring) — {startedCount} ({startedPercent}%)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded" style={{ background: '#92400e' }} />
                                <span className="text-sm text-gray-700">Hiç Girilmedi — {untouchedCount} ({untouchedPercent}%)</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
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
                        statusFilters={statusFilters}
                        onStatusFiltersChange={setStatusFilters}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-md border border-gray-200 h-[600px]">
                    <LocationList
                      locations={currentLocations}
                      regions={locations}
                      onLocationSelect={handleLocationSelect}
                      onShowDetails={handleShowDetails}
                      onLocationDoubleClick={(location) => {
                        setView('map');
                        setFocusLocation(location);
                        setSelectedLocation(location);
                      }}
                    />
                  </div>
                )
              ) : (
                <div className="min-h-[50vh] flex items-center justify-center">
                  <div className="bg-white rounded-xl shadow-md border border-gray-200 px-6 py-6 max-w-md text-center">
                    <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-1">Görüntüleme yetkiniz yok</h2>
                    <p className="text-sm text-gray-600">
                      Bu hesap için lokasyonların detaylı listesi ve istatistikleri gizlendi.
                      Lütfen yöneticinizle iletişime geçerek
                      <span className="font-medium"> Görüntüle </span>
                      yetkisini aktif etmelerini isteyin.
                    </p>
                  </div>
                </div>
              )}

              {/* Edit Modal */}
              {selectedLocation && (
                <LocationEditModal
                  location={selectedLocation}
                  isOpen={isEditModalOpen}
                  isCreate={isCreateMode}
                  isAdmin={userCanDelete}
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
                  canEdit={userCanEdit}
                />
              )}
              {/* Route Builder Modal */}
              <RouteBuilderModal
                isOpen={isRouteModalOpen}
                onClose={() => {
                  setIsRouteModalOpen(false);
                  setPendingTaskToStart(null);
                }}
                locations={allLocations}
                regions={locations}
                userLocation={userLocation}
                initialSelectedIds={pendingTaskToStart ? (pendingTaskToStart.routeLocationIds || []).map((x) => String(x)) : undefined}
                initialRegionFilter={pendingTaskToStart?.regionId ?? undefined}
                initialStartMode={pendingTaskToStart ? 'current' : undefined}
                onStartRoute={async (route: Location[]) => {
                  await startRoute(route, pendingTaskToStart?.id ?? null);
                  setTimeout(() => {
                    setIsRouteModalOpen(false);
                    setPendingTaskToStart(null);
                  }, 100);
                }}
              />

              {/* Team Panel */}
              <TeamPanel
                isOpen={isTeamPanelOpen}
                onClose={() => setIsTeamPanelOpen(false)}
                currentUserId={currentUser?.id ?? null}
                currentUsername={currentUser?.username ?? null}
                regions={locations}
                onFocusMember={canViewLiveMap ? ((memberId: string, username: string, lat: number, lng: number) => {
                  setFollowMember({ id: memberId, username, lat, lng });
                  setView('map');
                  setIsTeamPanelOpen(false);
                  setIsLiveMapOpen(true);
                }) : undefined}
              />

              {userRole === 'admin' && (
                <MesaiTrackingPanel
                  isOpen={isMesaiTrackingOpen}
                  onClose={() => setIsMesaiTrackingOpen(false)}
                />
              )}

              {/* Fullscreen Live Map Panel */}
              {isLiveMapOpen && canViewLiveMap && (
                <LiveMapPanel
                  isOpen={isLiveMapOpen}
                  onClose={() => setIsLiveMapOpen(false)}
                />
              )}

              {/* Location Tracking Overlay - only for users with view permission */}
              {userCanView && activeRoute && activeRoute.length > 0 && (
                <LocationTrackingOverlay
                  currentLocation={currentTargetLocation}
                  distanceToTarget={trackingState.distanceToTarget}
                  isNearby={trackingState.isNearby}
                  isWorking={trackingState.isWorking}
                  workStartTime={trackingState.workStartTime}
                  manualGpsAllowed={!!userCanManualGps}
                  manualGpsMode={manualGpsMode}
                  onManualGpsModeChange={setManualGpsMode}
                  onArrivalConfirm={handleArrivalConfirm}
                  onCompletionConfirm={handleCompletionConfirm}
                  onCancelRoute={handleCancelRoute}
                />
              )}

              {/* Admin: Acceptance approvals (fullscreen) */}
              {userRole === 'admin' && isAcceptanceApprovalsOpen && currentUser && (
                <AdminAcceptanceRequestsFullscreen
                  currentUserId={currentUser.id}
                  currentUsername={currentUser.username}
                  onPendingCountChanged={(count) => {
                    setPendingAcceptanceCount(count);
                    if (import.meta.env.DEV) console.debug('[acceptance badge] pushed from fullscreen', { count });
                  }}
                  onClose={() => setIsAcceptanceApprovalsOpen(false)}
                />
              )}

              {/* Admin: Assigned tasks created by this admin (fullscreen) */}
              {userRole === 'admin' && isAssignedTasksAdminOpen && currentUser && (
                <AdminAssignedTasksFullscreen
                  currentUserId={currentUser.id}
                  onClose={() => setIsAssignedTasksAdminOpen(false)}
                />
              )}

              {/* Admin Panel Modal */}
              {isAdminPanelOpen && currentUser && (
                <AdminPanel
                  currentUserId={currentUser.id}
                  onClose={() => setIsAdminPanelOpen(false)}
                />
              )}

              {/* Tasks Panel Modal */}
              {currentUser && (
                <TasksPanel
                  isOpen={isTasksPanelOpen}
                  onClose={() => setIsTasksPanelOpen(false)}
                  userId={currentUser.id}
                  onStartTask={handleStartTask}
                />
              )}

              {/* Messages Overlay */}
              {canUseMessages && currentUser && userRole !== 'admin' && (
                <MessagesOverlay
                  isOpen={isMessagesOpen}
                  onClose={() => setIsMessagesOpen(false)}
                  currentUser={currentUser}
                />
              )}

              {canUseMessages && currentUser && userRole === 'admin' && (
                <AdminMessagesOverlay
                  isOpen={isMessagesOpen}
                  onClose={() => setIsMessagesOpen(false)}
                  currentAdminId={String(currentUser.id)}
                />
              )}
            </main>

            {currentUser && (
              <>
                <MobileBottomNav
                  activeTab={((): MobileTabKey => {
                    if (mobileSheet === 'management') return 'management';
                    if (mobileSheet === 'profile') return 'profile';
                    if (isMessagesOpen) return 'messages';
                    return view === 'list' ? 'list' : 'map';
                  })()}
                  showMessagesTab={!!canUseMessages}
                  unreadMessagesCount={unreadMessagesCount}
                  onSelectTab={(tab) => {
                    if (tab === 'map' || tab === 'list') {
                      setMobileSheet('none');
                      setIsMessagesOpen(false);
                      setView(tab);
                      return;
                    }

                    if (tab === 'messages') {
                      if (!canUseMessages) return;
                      setMobileSheet('none');
                      setIsMessagesOpen(true);
                      return;
                    }

                    if (tab === 'management') {
                      setIsMessagesOpen(false);
                      setMobileSheet((prev) => (prev === 'management' ? 'none' : 'management'));
                      return;
                    }

                    if (tab === 'profile') {
                      setIsMessagesOpen(false);
                      setMobileSheet((prev) => (prev === 'profile' ? 'none' : 'profile'));
                    }
                  }}
                />

                <MobileSheet
                  open={mobileSheet === 'management'}
                  title="Yönetim"
                  onClose={() => setMobileSheet('none')}
                >
                  <div className="grid grid-cols-2 gap-3">
                    {canViewLiveMap && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setIsLiveMapOpen(true);
                        }}
                        className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold text-gray-900">Canlı Harita</div>
                        <div className="mt-1 text-xs text-gray-500">Ekip konumları</div>
                      </button>
                    )}

                    {userCanRoute && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setIsRouteModalOpen(true);
                        }}
                        className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left text-blue-800 hover:bg-blue-100 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold">Rota Oluştur</div>
                        <div className="mt-1 text-xs opacity-80">Planlama</div>
                      </button>
                    )}

                    {currentUser && (userCanRoute || userRole === 'editor' || userRole === 'admin') && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setIsTasksPanelOpen(true);
                        }}
                        className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold text-gray-900">Görevler</div>
                        <div className="mt-1 text-xs text-gray-500">Atama ve takip</div>
                      </button>
                    )}

                    {userCanTeamView && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setIsTeamPanelOpen(true);
                        }}
                        className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold text-gray-900">Ekip Durumu</div>
                        <div className="mt-1 text-xs text-gray-500">Canlı durum</div>
                      </button>
                    )}

                    {userCanCreate && (
                      <button
                        type="button"
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
                              isTwoDoorCardAccess: false,
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
                          setMobileSheet('none');
                        }}
                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-800 hover:bg-amber-100 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold">Yeni Lokasyon</div>
                        <div className="mt-1 text-xs opacity-80">Oluştur</div>
                      </button>
                    )}

                    {userCanExport && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileSheet('none');
                            handleExportExcel();
                          }}
                          className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                        >
                          <div className="text-sm font-semibold text-gray-900">Excel'e Aktar</div>
                          <div className="mt-1 text-xs text-gray-500">Dışa Aktar</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileSheet('none');
                            handleExportPDF();
                          }}
                          className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                        >
                          <div className="text-sm font-semibold text-gray-900">PDF'e Aktar</div>
                          <div className="mt-1 text-xs text-gray-500">Dışa Aktar</div>
                        </button>
                      </>
                    )}

                    {userRole === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setIsAcceptanceApprovalsOpen(true);
                        }}
                        className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold text-gray-900">Kabul Onayları</div>
                        <div className="mt-1 text-xs text-gray-500">Bekleyen: {pendingAcceptanceCount}</div>
                      </button>
                    )}

                    {userRole === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setIsAdminPanelOpen(true);
                        }}
                        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-left text-red-800 hover:bg-red-100 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold">Admin Paneli</div>
                        <div className="mt-1 text-xs opacity-80">Ayarlar</div>
                      </button>
                    )}

                    {userRole === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileSheet('none');
                          setActivityFullscreenOpen(true);
                        }}
                        className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50 active:scale-[0.99] transition"
                      >
                        <div className="text-sm font-semibold text-gray-900">Aktiviteler</div>
                        <div className="mt-1 text-xs text-gray-500">Geçmiş</div>
                      </button>
                    )}
                  </div>
                </MobileSheet>

                <MobileSheet
                  open={mobileSheet === 'profile'}
                  title="Hesap"
                  onClose={() => setMobileSheet('none')}
                >
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="text-sm font-semibold text-gray-900">{currentUser?.username ?? 'Kullanıcı'}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {userRole === 'admin' ? 'Yönetici' : userRole === 'editor' ? 'Editör' : userRole === 'viewer' ? 'İzleyici' : 'Kullanıcı'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full rounded-2xl border border-red-200 bg-red-50 p-4 text-left text-red-800 hover:bg-red-100 active:scale-[0.99] transition"
                    >
                      <div className="text-sm font-semibold">Çıkış Yap</div>
                      <div className="mt-1 text-xs opacity-80">Oturumu kapat</div>
                    </button>
                  </div>
                </MobileSheet>
              </>
            )}
            </div>
          </div>
        </RequireAuth>
      } />
      </Routes>
    </>
  );
}

export default App;