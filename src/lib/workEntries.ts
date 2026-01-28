import { apiFetch } from './apiClient';

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
    await apiFetch('/work-entries', {
      method: 'POST',
      body: JSON.stringify({
        user_id: String(entry.userId),
        username: entry.username,
        location_id: entry.locationId ?? null,
        location_name: entry.locationName ?? null,
        departed_at: entry.departedAt ?? null,
        arrived_at: entry.arrivedAt,
        completed_at: entry.completedAt,
        travel_minutes: Number(entry.travelMinutes || 0),
        work_minutes: Number(entry.workMinutes || 0),
      }),
    });
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
    const qs = new URLSearchParams({
      startIso: params.startIso,
      endIso: params.endIso,
      limit: String(limit),
    });
    const res = await apiFetch(`/work-entries?${qs.toString()}`);
    return { ok: true as const, rows: ((res as any)?.data ?? []) as WorkEntryRow[] };
  } catch (e) {
    console.warn('listWorkEntries exception', e);
    return { ok: false as const, rows: [] as WorkEntryRow[], error: e };
  }
};
