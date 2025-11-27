// LocalStorage key constants
const STORAGE_KEYS = {
  ACTIVE_ROUTE: 'route_tracking_active_route',
  CURRENT_INDEX: 'route_tracking_current_index',
  IS_TRACKING: 'route_tracking_is_tracking',
  TRACKING_STATE: 'route_tracking_state',
  USER_INFO: 'route_tracking_user'
};

export interface RouteTrackingStorage {
  activeRoute: any[] | null;
  currentRouteIndex: number;
  isTrackingRoute: boolean;
  trackingState: {
    arrivalTime: string | null;
    isWorking: boolean;
    workStartTime: string | null;
  };
  username: string;
  timestamp: string;
}

// Save tracking state to localStorage
export const saveTrackingState = (state: RouteTrackingStorage): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ROUTE, JSON.stringify(state.activeRoute));
    localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(state.currentRouteIndex));
    localStorage.setItem(STORAGE_KEYS.IS_TRACKING, String(state.isTrackingRoute));
    localStorage.setItem(STORAGE_KEYS.TRACKING_STATE, JSON.stringify(state.trackingState));
    localStorage.setItem(STORAGE_KEYS.USER_INFO, state.username);
    console.log('💾 Rota state kaydedildi');
  } catch (error) {
    console.error('❌ State kaydetme hatası:', error);
  }
};

// Load tracking state from localStorage
export const loadTrackingState = (): RouteTrackingStorage | null => {
  try {
    const activeRouteStr = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROUTE);
    const currentIndexStr = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
    const isTrackingStr = localStorage.getItem(STORAGE_KEYS.IS_TRACKING);
    const trackingStateStr = localStorage.getItem(STORAGE_KEYS.TRACKING_STATE);
    const username = localStorage.getItem(STORAGE_KEYS.USER_INFO);

    if (!activeRouteStr || !isTrackingStr || isTrackingStr === 'false') {
      return null;
    }

    const state: RouteTrackingStorage = {
      activeRoute: JSON.parse(activeRouteStr),
      currentRouteIndex: parseInt(currentIndexStr || '0'),
      isTrackingRoute: isTrackingStr === 'true',
      trackingState: trackingStateStr ? JSON.parse(trackingStateStr) : {
        arrivalTime: null,
        isWorking: false,
        workStartTime: null
      },
      username: username || '',
      timestamp: new Date().toISOString()
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
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ROUTE);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_INDEX);
    localStorage.removeItem(STORAGE_KEYS.IS_TRACKING);
    localStorage.removeItem(STORAGE_KEYS.TRACKING_STATE);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    console.log('🗑️ Rota state temizlendi');
  } catch (error) {
    console.error('❌ State temizleme hatası:', error);
  }
};
