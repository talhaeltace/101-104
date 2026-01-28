import { apiFetch } from './apiClient';

export type AcceptanceRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AcceptanceRequest {
  id: number;
  locationId: string;
  locationName: string;
  requestedByUserId: string;
  requestedByUsername: string;
  status: AcceptanceRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewedByUsername: string | null;
}

const mapRow = (row: any): AcceptanceRequest => ({
  id: Number(row.id),
  locationId: String(row.location_id),
  locationName: String(row.location_name),
  requestedByUserId: String(row.requested_by_user_id),
  requestedByUsername: String(row.requested_by_username),
  status: (row.status as AcceptanceRequestStatus) || 'pending',
  createdAt: String(row.created_at),
  reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  reviewedByUserId: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
  reviewedByUsername: row.reviewed_by_username ? String(row.reviewed_by_username) : null
});

export const listPendingAcceptanceRequests = async (): Promise<AcceptanceRequest[]> => {
  try {
    const res = await apiFetch('/acceptance-requests/pending');
    const rows = ((res as any)?.data ?? []) as any[];
    return rows.map(mapRow);
  } catch (e) {
    console.warn('listPendingAcceptanceRequests exception', e);
    return [];
  }
};

export const createAcceptanceRequest = async (params: {
  locationId: string;
  locationName: string;
  requestedByUserId: string;
  requestedByUsername: string;
}): Promise<{ success: boolean; alreadyPending?: boolean }> => {
  const locationId = String(params.locationId);

  try {
    const res = await apiFetch('/acceptance-requests', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        locationName: params.locationName,
        requestedByUserId: params.requestedByUserId,
        requestedByUsername: params.requestedByUsername,
      }),
    });

    return {
      success: (res as any)?.success === true,
      alreadyPending: (res as any)?.alreadyPending === true,
    };
  } catch (e) {
    console.warn('createAcceptanceRequest exception', e);
    return { success: false };
  }
};

export const approveAcceptanceRequest = async (params: {
  requestId: number;
  adminUserId: string;
  adminUsername?: string;
}): Promise<boolean> => {
  try {
    const res = await apiFetch(`/acceptance-requests/${encodeURIComponent(String(params.requestId))}/approve`, {
      method: 'POST',
    });
    return (res as any)?.success === true;
  } catch (e) {
    console.warn('approveAcceptanceRequest exception', e);
    return false;
  }
};

export const rejectAcceptanceRequest = async (params: {
  requestId: number;
  adminUserId: string;
  adminUsername?: string;
}): Promise<boolean> => {
  try {
    const res = await apiFetch(`/acceptance-requests/${encodeURIComponent(String(params.requestId))}/reject`, {
      method: 'POST',
    });
    return (res as any)?.success === true;
  } catch (e) {
    console.warn('rejectAcceptanceRequest exception', e);
    return false;
  }
};
