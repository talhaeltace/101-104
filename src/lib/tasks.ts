import { apiFetch } from './apiClient';

export type TaskStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export type RouteLocationId = string | number;

export interface Task {
  id: string;
  title: string;
  description?: string | null;

  createdAt: string;
  createdByUserId?: string | null;
  createdByUsername?: string | null;

  assignedToUserId: string;
  assignedToUsername?: string | null;

  regionId?: number | null;
  regionName?: string | null;

  routeLocationIds: RouteLocationId[];

  status: TaskStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  created_by_user_id: string | null;
  created_by_username: string | null;
  assigned_to_user_id: string;
  assigned_to_username: string | null;
  region_id: number | null;
  region_name: string | null;
  route_location_ids: unknown;
  status: TaskStatus;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

const toTask = (row: TaskRow): Task => {
  const rawIds = row.route_location_ids;
  const routeLocationIds: RouteLocationId[] = Array.isArray(rawIds) ? (rawIds as any[]) : [];

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    createdByUsername: row.created_by_username,
    assignedToUserId: row.assigned_to_user_id,
    assignedToUsername: row.assigned_to_username,
    regionId: row.region_id,
    regionName: row.region_name,
    routeLocationIds,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at
  };
};

export async function createTask(input: {
  title: string;
  description?: string | null;
  createdByUserId?: string | null;
  createdByUsername?: string | null;
  assignedToUserId: string;
  assignedToUsername?: string | null;
  regionId?: number | null;
  regionName?: string | null;
  routeLocationIds: RouteLocationId[];
}): Promise<{ success: boolean; data?: Task; error?: string }> {
  try {
    const res = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        description: input.description ?? null,
        assigned_to_user_id: input.assignedToUserId,
        assigned_to_username: input.assignedToUsername ?? null,
        region_id: input.regionId ?? null,
        region_name: input.regionName ?? null,
        route_location_ids: input.routeLocationIds,
      }),
    });

    const row = (res as any)?.data as TaskRow | undefined;
    if (!row) return { success: false, error: 'Görev oluşturulamadı' };
    return { success: true, data: toTask(row) };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Görev oluşturulamadı' };
  }
}

export async function listTasksForUser(userId: string): Promise<Task[]> {
  try {
    const res = await apiFetch(`/tasks?assigned_to_user_id=${encodeURIComponent(userId)}`);
    const rows = ((res as any)?.data ?? []) as TaskRow[];
    return rows.map(toTask);
  } catch (e) {
    console.warn('listTasksForUser exception', e);
    return [];
  }
}

export async function listTasksCreatedByUser(userId: string): Promise<Task[]> {
  try {
    const res = await apiFetch(`/tasks?created_by_user_id=${encodeURIComponent(userId)}`);
    const rows = ((res as any)?.data ?? []) as TaskRow[];
    return rows.map(toTask);
  } catch (e) {
    console.warn('listTasksCreatedByUser exception', e);
    return [];
  }
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
  try {
    await apiFetch(`/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return true;
  } catch (e) {
    console.warn('updateTaskStatus exception', e);
    return false;
  }
}
