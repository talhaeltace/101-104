import { supabase } from './supabase';

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
    const { data, error } = await supabase
      .from('location_acceptance_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('listPendingAcceptanceRequests error', error);
      return [];
    }

    return (data || []).map(mapRow);
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
    // Avoid duplicate pending requests for the same location
    const { data: existing, error: existingError } = await supabase
      .from('location_acceptance_requests')
      .select('id')
      .eq('location_id', locationId)
      .eq('status', 'pending')
      .limit(1);

    if (!existingError && existing && existing.length > 0) {
      return { success: true, alreadyPending: true };
    }

    const { error } = await supabase.from('location_acceptance_requests').insert({
      location_id: locationId,
      location_name: params.locationName,
      requested_by_user_id: params.requestedByUserId,
      requested_by_username: params.requestedByUsername,
      status: 'pending'
    });

    if (error) {
      console.warn('createAcceptanceRequest error', error);
      return { success: false };
    }

    return { success: true };
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
    // Fetch request so we know which location to update
    const { data: requestRow, error: fetchError } = await supabase
      .from('location_acceptance_requests')
      .select('*')
      .eq('id', params.requestId)
      .maybeSingle();

    if (fetchError || !requestRow) {
      console.warn('approveAcceptanceRequest fetch error', fetchError);
      return false;
    }

    const locationId = String(requestRow.location_id);

    const now = new Date().toISOString();

    // Mark location accepted
    const { error: locationError } = await supabase
      .from('locations')
      .update({ is_accepted: true, updated_at: now })
      .eq('id', locationId);

    if (locationError) {
      console.warn('approveAcceptanceRequest location update error', locationError);
      return false;
    }

    // Mark request approved
    const { error: requestError } = await supabase
      .from('location_acceptance_requests')
      .update({
        status: 'approved',
        reviewed_at: now,
        reviewed_by_user_id: params.adminUserId,
        reviewed_by_username: params.adminUsername ?? null
      })
      .eq('id', params.requestId);

    if (requestError) {
      console.warn('approveAcceptanceRequest request update error', requestError);
      return false;
    }

    return true;
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
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('location_acceptance_requests')
      .update({
        status: 'rejected',
        reviewed_at: now,
        reviewed_by_user_id: params.adminUserId,
        reviewed_by_username: params.adminUsername ?? null
      })
      .eq('id', params.requestId);

    if (error) {
      console.warn('rejectAcceptanceRequest error', error);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('rejectAcceptanceRequest exception', e);
    return false;
  }
};
