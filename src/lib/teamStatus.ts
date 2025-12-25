import { supabase } from './supabase';
import { Location } from '../data/regions';

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
 * Update team status in Supabase (includes route data and detailed tracking)
 * Has fallback for old DB schema without detailed tracking columns
 */
export async function updateTeamStatus(update: TeamStatusUpdate): Promise<boolean> {
  try {
    console.log('Updating team status:', update.status, 'route length:', update.activeRoute?.length ?? 0);
    
    // Try with new parameters first (detailed tracking)
    const { data, error } = await supabase.rpc('update_team_status', {
      p_user_id: update.userId,
      p_username: update.username,
      p_status: update.status,
      p_current_location_id: update.currentLocationId ?? null,
      p_current_location_name: update.currentLocationName ?? null,
      p_next_location_name: update.nextLocationName ?? null,
      p_total_route_count: update.totalRouteCount ?? 0,
      p_completed_count: update.completedCount ?? 0,
      p_current_lat: update.currentLat ?? null,
      p_current_lng: update.currentLng ?? null,
      p_active_route: update.activeRoute ?? null,
      p_current_route_index: update.currentRouteIndex ?? 0,
      p_is_working: update.isWorking ?? false,
      p_work_start_time: update.workStartTime?.toISOString() ?? null,
      p_completed_locations: update.completedLocations ?? null,
      p_current_leg_start_time: update.currentLegStartTime?.toISOString() ?? null,
      p_total_travel_minutes: update.totalTravelMinutes ?? null,
      p_total_work_minutes: update.totalWorkMinutes ?? null,
      p_today_completed_count: update.todayCompletedCount ?? null
    });

    if (error) {
      // If error mentions unknown parameters, try with old schema (fallback)
      if (error.message?.includes('p_completed_locations') || 
          error.message?.includes('p_current_leg_start_time') ||
          error.message?.includes('p_total_travel') ||
          error.message?.includes('p_total_work') ||
          error.message?.includes('p_today_completed') ||
          error.code === '42883') { // function does not exist with those params
        console.warn('DB schema outdated, using fallback without detailed tracking');
        return await updateTeamStatusLegacy(update);
      }
      console.error('Failed to update team status:', error, 'params:', { userId: update.userId, status: update.status });
      return false;
    }
    
    console.log('Team status updated successfully:', data);
    return data?.success === true;
  } catch (err) {
    console.error('Team status update error:', err);
    // Try legacy as last resort
    try {
      return await updateTeamStatusLegacy(update);
    } catch {
      return false;
    }
  }
}

/**
 * Legacy update for old DB schema without detailed tracking columns
 */
async function updateTeamStatusLegacy(update: TeamStatusUpdate): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('update_team_status', {
      p_user_id: update.userId,
      p_username: update.username,
      p_status: update.status,
      p_current_location_id: update.currentLocationId ?? null,
      p_current_location_name: update.currentLocationName ?? null,
      p_next_location_name: update.nextLocationName ?? null,
      p_total_route_count: update.totalRouteCount ?? 0,
      p_completed_count: update.completedCount ?? 0,
      p_current_lat: update.currentLat ?? null,
      p_current_lng: update.currentLng ?? null,
      p_active_route: update.activeRoute ?? null,
      p_current_route_index: update.currentRouteIndex ?? 0,
      p_is_working: update.isWorking ?? false,
      p_work_start_time: update.workStartTime?.toISOString() ?? null
    });

    if (error) {
      console.error('Legacy update failed:', error);
      return false;
    }
    
    console.log('Legacy team status updated:', data);
    return data?.success === true;
  } catch (err) {
    console.error('Legacy team status error:', err);
    return false;
  }
}

/**
 * Get user's active route and tracking data from database
 */
export async function getUserRoute(userId: string): Promise<UserRouteData | null> {
  try {
    console.log('Fetching route from DB for user:', userId);
    const { data, error } = await supabase.rpc('get_user_route', {
      p_user_id: userId
    });

    console.log('get_user_route response:', { data, error });

    if (error) {
      console.error('Failed to get user route:', error);
      return null;
    }

    if (!data?.success || !data?.data) {
      console.log('No route data in response');
      return null;
    }

    const routeData = data.data;
    console.log('Raw route data:', routeData);
    
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
    
    console.log('Parsed route result:', result);
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
    const { data, error } = await supabase.rpc('clear_team_status', {
      p_user_id: userId
    });

    if (error) {
      console.error('Failed to clear team status:', error);
      return false;
    }

    return data?.success === true;
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
    const { data, error } = await supabase.rpc('reset_daily_team_stats', {
      p_user_id: userId
    });

    if (error) {
      console.error('Failed to reset daily team stats:', error);
      return false;
    }

    return data?.success === true;
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
