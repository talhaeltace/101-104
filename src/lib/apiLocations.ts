import { apiFetch } from './apiClient';

export type LocationRow = Record<string, any>;

export async function fetchLocationRows(params?: {
  projectId?: string | number;
  regionId?: number;
}): Promise<LocationRow[]> {
  const qs = new URLSearchParams();
  if (params?.projectId !== undefined && params?.projectId !== null && String(params.projectId).trim()) {
    qs.set('project_id', String(params.projectId));
  }
  if (params?.regionId !== undefined && params?.regionId !== null && Number.isFinite(params.regionId)) {
    qs.set('region_id', String(params.regionId));
  }

  const url = `/locations${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await apiFetch(url);
  return (res as any)?.data ?? [];
}

export async function seedLocationsIfEmpty(rows: LocationRow[]): Promise<{ inserted: number; skipped?: boolean }> {
  const res = await apiFetch('/locations/seed-if-empty', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return {
    inserted: Number((res as any)?.inserted ?? 0),
    skipped: (res as any)?.skipped,
  };
}

export async function updateLocationRow(id: string, patch: LocationRow): Promise<LocationRow> {
  const res = await apiFetch(`/locations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return (res as any)?.data;
}

export async function createLocationRow(row: LocationRow): Promise<LocationRow> {
  const res = await apiFetch('/locations', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  return (res as any)?.data;
}

export async function deleteLocationRow(id: string): Promise<void> {
  await apiFetch(`/locations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
