// LocalStorage key constants
// NOTE: keep backward compatibility with older per-key storage.
const STORAGE_KEYS = {
  SNAPSHOT_V2: 'route_tracking_snapshot_v2',

  // Pending DB sync payload (best-effort). Used when the app goes offline/closed
  // before the last route/team status update could be persisted server-side.
  PENDING_TEAM_STATUS_V1: 'route_tracking_pending_team_status_v1',

  // legacy keys (v1)
  ACTIVE_ROUTE: 'route_tracking_active_route',
  CURRENT_INDEX: 'route_tracking_current_index',
  IS_TRACKING: 'route_tracking_is_tracking',
  TRACKING_STATE: 'route_tracking_state',
  USER_INFO: 'route_tracking_user'
};

export interface RouteTrackingStorage {
  version: 2;
  userId?: string;
  username: string;

  // Optional: if this route was started from a task assignment
  activeTaskId?: string | null;

  activeRoute: any[] | null;
  currentRouteIndex: number;
  isTrackingRoute: boolean;

  // minimal persisted tracking state (enough to resume overlay)
  trackingState: {
    arrivalTime: string | null;
    isWorking: boolean;
    workStartTime: string | null;
  };

  // extra timing + stats used by App.tsx
  currentLegStartTime?: string | null;
  completedLocations?: any[];
  totalTravelMinutes?: number;
  totalWorkMinutes?: number;
  todayCompletedCount?: number;

  savedAt: string;
}

export interface PendingTeamStatusUpdateStorage {
  version: 1;
  userId: string;
  username: string;
  payload: any;
  savedAt: string;
  lastTriedAt?: string;
}

// Save tracking state to localStorage
export const saveTrackingState = (state: RouteTrackingStorage): void => {
  try {
    // v2 single-snapshot write
    localStorage.setItem(STORAGE_KEYS.SNAPSHOT_V2, JSON.stringify(state));

    // legacy writes (best-effort) so older builds can still resume
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ROUTE, JSON.stringify(state.activeRoute));
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(state.currentRouteIndex));
      localStorage.setItem(STORAGE_KEYS.IS_TRACKING, String(state.isTrackingRoute));
      localStorage.setItem(STORAGE_KEYS.TRACKING_STATE, JSON.stringify(state.trackingState));
      localStorage.setItem(STORAGE_KEYS.USER_INFO, state.username);
    } catch {
      // ignore legacy write errors
    }
  } catch (error) {
    console.error('❌ State kaydetme hatası:', error);
  }
};

// Load tracking state from localStorage
export const loadTrackingState = (): RouteTrackingStorage | null => {
  try {
    // Prefer v2 snapshot
    const snapStr = localStorage.getItem(STORAGE_KEYS.SNAPSHOT_V2);
    if (snapStr) {
      const parsed = JSON.parse(snapStr) as Partial<RouteTrackingStorage>;
      if (parsed && (parsed as any).version === 2 && parsed.isTrackingRoute && Array.isArray(parsed.activeRoute) && parsed.activeRoute.length > 0) {
        return parsed as RouteTrackingStorage;
      }
    }

    // Fallback: legacy per-key storage
    const activeRouteStr = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROUTE);
    const currentIndexStr = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
    const isTrackingStr = localStorage.getItem(STORAGE_KEYS.IS_TRACKING);
    const trackingStateStr = localStorage.getItem(STORAGE_KEYS.TRACKING_STATE);
    const username = localStorage.getItem(STORAGE_KEYS.USER_INFO);

    if (!activeRouteStr || !isTrackingStr || isTrackingStr === 'false') {
      return null;
    }

    const state: RouteTrackingStorage = {
      version: 2,
      userId: undefined,
      username: username || '',
      activeRoute: JSON.parse(activeRouteStr),
      currentRouteIndex: parseInt(currentIndexStr || '0'),
      isTrackingRoute: isTrackingStr === 'true',
      trackingState: trackingStateStr ? JSON.parse(trackingStateStr) : {
        arrivalTime: null,
        isWorking: false,
        workStartTime: null
      },
      savedAt: new Date().toISOString()
    };

    console.log('📂 Kaydedilmiş rota yüklendi:', state);
    return state;
  } catch (error) {
    console.error('❌ State yükleme hatası:', error);
    return null;
  }
};

// Clear tracking state
export const clearTrackingState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEYS.SNAPSHOT_V2);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ROUTE);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX);
    localStorage.removeItem(STORAGE_KEYS.IS_TRACKING);
    localStorage.removeItem(STORAGE_KEYS.TRACKING_STATE);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
  } catch (error) {
    console.error('❌ State temizleme hatası:', error);
  }
};

export const savePendingTeamStatusUpdate = (data: PendingTeamStatusUpdateStorage): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.PENDING_TEAM_STATUS_V1, JSON.stringify(data));
  } catch {
    // ignore
  }
};

export const loadPendingTeamStatusUpdate = (): PendingTeamStatusUpdateStorage | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PENDING_TEAM_STATUS_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingTeamStatusUpdateStorage>;
    if (!parsed || (parsed as any).version !== 1) return null;
    if (!parsed.userId || !parsed.username || !parsed.payload) return null;
    return parsed as PendingTeamStatusUpdateStorage;
  } catch {
    return null;
  }
};

export const clearPendingTeamStatusUpdate = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEYS.PENDING_TEAM_STATUS_V1);
  } catch {
    // ignore
  }
};
