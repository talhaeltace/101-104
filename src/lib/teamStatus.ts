import { Location } from '../data/regions';
import { apiFetch } from './apiClient';

// Completed location with timing info
export interface CompletedLocationInfo {
  id: number | string;
  name: string;
  regionName?: string;
  arrivedAt: string; // ISO timestamp
  completedAt: string; // ISO timestamp
  workDurationMinutes: number;
  travelDurationMinutes: number; // Time to get here from previous location
}

export interface TeamStatusUpdate {
  userId: string;
  username: string;
  status: 'idle' | 'yolda' | 'adreste' | 'tamamladi';
  currentLocationId?: number | null;
  currentLocationName?: string | null;
  nextLocationName?: string | null;
  totalRouteCount?: number;
  completedCount?: number;
  currentLat?: number | null;
  currentLng?: number | null;
  activeRoute?: Location[] | null;
  currentRouteIndex?: number;
  isWorking?: boolean;
  workStartTime?: Date | null;
  // New detailed tracking fields
  completedLocations?: CompletedLocationInfo[] | null;
  currentLegStartTime?: Date | null;
  totalTravelMinutes?: number;
  totalWorkMinutes?: number;
  todayCompletedCount?: number;
}

export interface UserRouteData {
  activeRoute: Location[] | null;
  currentRouteIndex: number;
  isWorking: boolean;
  workStartTime: Date | null;
  status: string;
  // New detailed tracking fields
  completedLocations: CompletedLocationInfo[];
  currentLegStartTime: Date | null;
  totalTravelMinutes: number;
  totalWorkMinutes: number;
  todayCompletedCount: number;
  todayStartedAt: Date | null;
  routeStartedAt: Date | null;
}

/**
 * Update team status via API/DB (includes route data and detailed tracking)
 */
export async function updateTeamStatus(update: TeamStatusUpdate): Promise<boolean> {
  try {
    if (import.meta.env.DEV) {
      console.log('Updating team status:', update.status, 'route length:', update.activeRoute?.length ?? 0);
    }

    const res = await apiFetch('/team-status/update', {
      method: 'POST',
      body: JSON.stringify(update),
    });

    return (res as any)?.success === true;
  } catch (err) {
    console.error('Team status update error:', err);
    return false;
  }
}

/**
 * Get user's active route and tracking data from database
 */
export async function getUserRoute(userId: string): Promise<UserRouteData | null> {
  try {
    if (import.meta.env.DEV) console.log('Fetching route from DB for user:', userId);

    const data = await apiFetch(`/team-status/route/${encodeURIComponent(userId)}`);
    if (import.meta.env.DEV) console.log('get_user_route response:', data);

    if (!(data as any)?.success || !(data as any)?.data) {
      if (import.meta.env.DEV) console.log('No route data in response');
      return null;
    }

    const routeData = (data as any).data;
    if (import.meta.env.DEV) console.log('Raw route data:', routeData);
    
    const result: UserRouteData = {
      activeRoute: routeData.active_route ? (typeof routeData.active_route === 'string' ? JSON.parse(routeData.active_route) : routeData.active_route) : null,
      currentRouteIndex: routeData.current_route_index || 0,
      isWorking: routeData.is_working || false,
      workStartTime: routeData.work_start_time ? new Date(routeData.work_start_time) : null,
      status: routeData.status || 'idle',
      completedLocations: routeData.completed_locations ? (typeof routeData.completed_locations === 'string' ? JSON.parse(routeData.completed_locations) : routeData.completed_locations) : [],
      currentLegStartTime: routeData.current_leg_start_time ? new Date(routeData.current_leg_start_time) : null,
      totalTravelMinutes: routeData.total_travel_minutes || 0,
      totalWorkMinutes: routeData.total_work_minutes || 0,
      todayCompletedCount: routeData.today_completed_count || 0,
      todayStartedAt: routeData.today_started_at ? new Date(routeData.today_started_at) : null,
      routeStartedAt: routeData.route_started_at ? new Date(routeData.route_started_at) : null
    };
    
    if (import.meta.env.DEV) console.log('Parsed route result:', result);
    return result;
  } catch (err) {
    console.error('Get user route error:', err);
    return null;
  }
}

/**
 * Clear team status when route is finished or cancelled
 * Preserves today's completed count and history
 */
export async function clearTeamStatus(userId: string): Promise<boolean> {
  try {
    const res = await apiFetch('/team-status/clear', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return (res as any)?.success === true;
  } catch (err) {
    console.error('Team status clear error:', err);
    return false;
  }
}

/**
 * Reset daily stats for a user (call at start of new day)
 */
export async function resetDailyTeamStats(userId: string): Promise<boolean> {
  try {
    const res = await apiFetch('/team-status/reset-daily', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return (res as any)?.success === true;
  } catch (err) {
    console.error('Reset daily stats error:', err);
    return false;
  }
}

/**
 * Calculate minutes between two dates
 */
export function calculateMinutesBetween(start: Date, end: Date): number {
  // For travel time, rounding down to 0 is confusing in UI; prefer ceiling.
  // (Only used in App.tsx for travel legs.)
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 60000));
}

/**
 * Format minutes as human readable duration
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 dk';
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} saat`;
  return `${hours} saat ${mins} dk`;
}
