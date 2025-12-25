import { supabase } from './supabase';

export interface ActivityLog {
  id?: string;
  username: string;
  action: string;
  location_id?: string;
  location_name?: string;
  arrival_time?: string;
  completion_time?: string;
  duration_minutes?: number;
  activity_type: 'arrival' | 'completion' | 'general';
  created_at?: string;
}

export const logActivity = async (activity: ActivityLog) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .insert([{
        username: activity.username,
        action: activity.action,
        location_id: activity.location_id || null,
        location_name: activity.location_name || null,
        arrival_time: activity.arrival_time || null,
        completion_time: activity.completion_time || null,
        duration_minutes: activity.duration_minutes || null,
        activity_type: activity.activity_type
      }])
      .select()
      .single();

    if (error) {
      console.error('Error logging activity:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Unexpected error logging activity:', err);
    return null;
  }
};

export const logArrival = async (
  username: string,
  locationId: string,
  locationName: string,
  arrivalTime: Date,
  travelMinutes?: number
) => {
  return logActivity({
    username,
    action: travelMinutes != null
      ? `${locationName} lokasyonuna vardı (${travelMinutes} dakika)`
      : `${locationName} lokasyonuna vardı`,
    location_id: locationId,
    location_name: locationName,
    arrival_time: arrivalTime.toISOString(),
    duration_minutes: travelMinutes,
    activity_type: 'arrival'
  });
};

export const logCompletion = async (
  username: string,
  locationId: string,
  locationName: string,
  startTime: Date,
  endTime: Date,
  durationMinutes: number
) => {
  return logActivity({
    username,
    action: `${locationName} lokasyonunu tamamladı (${durationMinutes} dakika)`,
    location_id: locationId,
    location_name: locationName,
    arrival_time: startTime.toISOString(),
    completion_time: endTime.toISOString(),
    duration_minutes: durationMinutes,
    activity_type: 'completion'
  });
};

export const getActivities = async (limit = 200) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching activities:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching activities:', err);
    return [];
  }
};

export const getActivitiesByLocation = async (locationId: string, limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching location activities:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching location activities:', err);
    return [];
  }
};
