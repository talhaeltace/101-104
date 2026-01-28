import { apiFetch } from './apiClient';

export type AppUserRow = {
  id: string;
  username: string;
  role: string;
  full_name: string | null;
  is_active?: boolean;
};

export type MessageRow = {
  id: number;
  created_at: string;
  user_id: string;
  sender_user_id: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  sender?: AppUserRow;
};

export async function listActiveUsers(): Promise<AppUserRow[]> {
  const res = await apiFetch('/users/active');
  return ((res as any)?.data ?? []) as AppUserRow[];
}

export async function fetchMessagesForUserThread(userId: string): Promise<MessageRow[]> {
  const res = await apiFetch(`/messages/thread/${encodeURIComponent(userId)}`);
  return ((res as any)?.data ?? []) as any;
}

export async function sendMessageToUserThread(params: {
  userId: string;
  senderUserId: string;
  body: string;
}): Promise<void> {
  const body = String(params.body ?? '').trim();
  if (!body) return;

  await apiFetch(`/messages/thread/${encodeURIComponent(params.userId)}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function broadcastMessageToAll(params: {
  senderUserId: string;
  body: string;
  includeAdmins?: boolean;
}): Promise<{ sent: number }>{
  const body = String(params.body ?? '').trim();
  if (!body) return { sent: 0 };

  const res = await apiFetch('/messages/broadcast', {
    method: 'POST',
    body: JSON.stringify({ body, includeAdmins: !!params.includeAdmins }),
  });

  return { sent: Number((res as any)?.sent ?? 0) };
}

// Mark messages as read by the other side.
// For a normal user: call with (userId=currentUserId, readerUserId=currentUserId).
// For admin reading a user's thread: call with (userId=targetUserId, readerUserId=adminId).
export async function markThreadRead(params: {
  userId: string;
  readerUserId: string;
}): Promise<void> {
  await apiFetch(`/messages/thread/${encodeURIComponent(params.userId)}/mark-read`, {
    method: 'POST',
  });
}
