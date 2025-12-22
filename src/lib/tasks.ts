import { supabase } from './supabase';

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
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: input.title,
        description: input.description ?? null,
        created_by_user_id: input.createdByUserId ?? null,
        created_by_username: input.createdByUsername ?? null,
        assigned_to_user_id: input.assignedToUserId,
        assigned_to_username: input.assignedToUsername ?? null,
        region_id: input.regionId ?? null,
        region_name: input.regionName ?? null,
        route_location_ids: input.routeLocationIds,
        status: 'assigned'
      })
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Görev oluşturulamadı' };
    }

    return { success: true, data: toTask(data as TaskRow) };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Görev oluşturulamadı' };
  }
}

export async function listTasksForUser(userId: string): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('listTasksForUser error', error);
      return [];
    }

    return (data || []).map((r: any) => toTask(r as TaskRow));
  } catch (e) {
    console.warn('listTasksForUser exception', e);
    return [];
  }
}

export async function listTasksCreatedByUser(userId: string): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('created_by_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('listTasksCreatedByUser error', error);
      return [];
    }

    return (data || []).map((r: any) => toTask(r as TaskRow));
  } catch (e) {
    console.warn('listTasksCreatedByUser exception', e);
    return [];
  }
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
  try {
    const patch: Record<string, any> = { status };
    const nowIso = new Date().toISOString();

    if (status === 'assigned') {
      patch.started_at = null;
      patch.completed_at = null;
      patch.cancelled_at = null;
    }
    if (status === 'in_progress') patch.started_at = nowIso;
    if (status === 'completed') patch.completed_at = nowIso;
    if (status === 'cancelled') patch.cancelled_at = nowIso;

    const { error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', taskId);

    if (error) {
      console.warn('updateTaskStatus error', error);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('updateTaskStatus exception', e);
    return false;
  }
}
