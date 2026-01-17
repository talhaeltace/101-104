import { supabase } from './supabase';

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
  const { data, error } = await supabase
    .from('app_users')
    .select('id, username, role, full_name, is_active')
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as any[];

  return rows
    .filter(r => r && (r.is_active === undefined || r.is_active === true))
    .map(r => ({
      id: String(r.id),
      username: String(r.username),
      role: String(r.role ?? 'user'),
      full_name: r.full_name ?? null,
      is_active: r.is_active,
    }));
}

export async function fetchMessagesForUserThread(userId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('app_messages')
    .select('id, created_at, user_id, sender_user_id, body, is_read, read_at, sender:sender_user_id (id, username, role, full_name, is_active)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as any;
}

export async function sendMessageToUserThread(params: {
  userId: string;
  senderUserId: string;
  body: string;
}): Promise<void> {
  const body = String(params.body ?? '').trim();
  if (!body) return;

  const { error } = await supabase
    .from('app_messages')
    .insert({ user_id: params.userId, sender_user_id: params.senderUserId, body });

  if (error) throw error;
}

export async function broadcastMessageToAll(params: {
  senderUserId: string;
  body: string;
  includeAdmins?: boolean;
}): Promise<{ sent: number }>{
  const body = String(params.body ?? '').trim();
  if (!body) return { sent: 0 };

  const users = await listActiveUsers();
  const targets = users
    .filter(u => u.id !== params.senderUserId)
    .filter(u => (params.includeAdmins ? true : String(u.role).toLowerCase() !== 'admin'));

  const rows = targets.map(u => ({
    user_id: u.id,
    sender_user_id: params.senderUserId,
    body,
  }));

  // Insert in batches to avoid payload limits.
  const batchSize = 200;
  let sent = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('app_messages').insert(chunk);
    if (error) throw error;
    sent += chunk.length;
  }

  return { sent };
}

// Mark messages as read by the other side.
// For a normal user: call with (userId=currentUserId, readerUserId=currentUserId).
// For admin reading a user's thread: call with (userId=targetUserId, readerUserId=adminId).
export async function markThreadRead(params: {
  userId: string;
  readerUserId: string;
}): Promise<void> {
  const { userId, readerUserId } = params;
  // If reader is the thread owner (user), then mark admin-sent messages as read.
  // If reader is admin, mark user-sent messages as read.
  const isReaderThreadOwner = userId === readerUserId;

  // Fetch unread message ids in thread.
  const { data, error } = await supabase
    .from('app_messages')
    .select('id, user_id, sender_user_id, is_read')
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  const rows = (data ?? []) as any[];

  const idsToMark = rows
    .filter(r => {
      const senderId = String(r.sender_user_id);
      const threadUserId = String(r.user_id);
      if (isReaderThreadOwner) {
        // reader is user -> mark messages sent by others (admins)
        return senderId !== threadUserId;
      }
      // reader is admin -> mark messages sent by user
      return senderId === threadUserId;
    })
    .map(r => Number(r.id))
    .filter(n => Number.isFinite(n));

  if (idsToMark.length === 0) return;

  const { error: updErr } = await supabase
    .from('app_messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in('id', idsToMark);

  if (updErr) throw updErr;
}
