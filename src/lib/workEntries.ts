import { supabase } from './supabase';

export interface WorkEntry {
  id?: number;
  userId: string;
  username: string;
  locationId?: string | null;
  locationName?: string | null;
  departedAt?: string | null; // ISO
  arrivedAt: string; // ISO
  completedAt: string; // ISO
  travelMinutes: number;
  workMinutes: number;
}

export const logWorkEntry = async (entry: WorkEntry): Promise<boolean> => {
  try {
    const { error } = await supabase.from('work_entries').insert({
      user_id: String(entry.userId),
      username: entry.username,
      location_id: entry.locationId ?? null,
      location_name: entry.locationName ?? null,
      departed_at: entry.departedAt ?? null,
      arrived_at: entry.arrivedAt,
      completed_at: entry.completedAt,
      travel_minutes: Number(entry.travelMinutes || 0),
      work_minutes: Number(entry.workMinutes || 0)
    });

    if (error) {
      console.warn('logWorkEntry error', error);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('logWorkEntry exception', e);
    return false;
  }
};

export interface WorkEntryRow {
  id: string;
  user_id: string;
  username: string;
  location_id: string | null;
  location_name: string | null;
  departed_at: string | null;
  arrived_at: string;
  completed_at: string;
  travel_minutes: number | null;
  work_minutes: number | null;
  created_at: string;
}

export const listWorkEntries = async (params: { startIso: string; endIso: string; limit?: number }) => {
  const limit = params.limit ?? 5000;

  try {
    const { data, error } = await supabase
      .from('work_entries')
      .select('*')
      .gte('completed_at', params.startIso)
      .lte('completed_at', params.endIso)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('listWorkEntries error', error);
      return { ok: false as const, rows: [] as WorkEntryRow[], error };
    }

    return { ok: true as const, rows: (data || []) as WorkEntryRow[] };
  } catch (e) {
    console.warn('listWorkEntries exception', e);
    return { ok: false as const, rows: [] as WorkEntryRow[], error: e };
  }
};
