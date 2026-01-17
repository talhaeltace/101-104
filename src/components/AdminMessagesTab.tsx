import React from 'react';
import { Search, Send, Users, MessageSquareText } from 'lucide-react';
import type { AppUser } from '../lib/userPermissions';
import { supabase } from '../lib/supabase';
import {
  broadcastMessageToAll,
  fetchMessagesForUserThread,
  markThreadRead,
  sendMessageToUserThread,
  type MessageRow,
} from '../lib/messages';

function roleBadge(role: string) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return 'bg-red-100 text-red-800';
  if (r === 'editor') return 'bg-blue-100 text-blue-800';
  if (r === 'viewer') return 'bg-gray-100 text-gray-800';
  return 'bg-green-100 text-green-800';
}

function roleLabel(role?: string | null) {
  const r = String(role ?? '').toLowerCase();
  if (r === 'admin') return 'Admin';
  if (r === 'editor') return 'Editör';
  if (r === 'viewer') return 'Görüntüleyici';
  return 'Kullanıcı';
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return ts;
  }
}

type AdminMessagesTabProps = {
  currentAdminId: string;
  users: AppUser[];
};

export default function AdminMessagesTab({ currentAdminId, users }: AdminMessagesTabProps) {
  const [query, setQuery] = React.useState('');
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const [broadcastDraft, setBroadcastDraft] = React.useState('');
  const [includeAdmins, setIncludeAdmins] = React.useState(false);
  const [broadcastSending, setBroadcastSending] = React.useState(false);

  const [unreadByUser, setUnreadByUser] = React.useState<Record<string, number>>({});

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const scrollToBottom = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const activeUsers = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = users
      .filter(u => (u.is_active ?? true) === true)
      .filter(u => String(u.id) !== String(currentAdminId));

    if (!q) return base;
    return base.filter(u =>
      String(u.username || '').toLowerCase().includes(q) ||
      String(u.full_name || '').toLowerCase().includes(q) ||
      String(u.role || '').toLowerCase().includes(q)
    );
  }, [users, query, currentAdminId]);

  const selectedUser = React.useMemo(() => {
    return users.find(u => String(u.id) === String(selectedUserId)) ?? null;
  }, [users, selectedUserId]);

  const loadUnread = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_messages')
        .select('id, user_id, sender_user_id, is_read')
        .eq('is_read', false);

      if (error) throw error;
      const rows = (data ?? []) as any[];
      const counts: Record<string, number> = {};
      for (const r of rows) {
        const userId = String(r.user_id);
        const senderId = String(r.sender_user_id);
        // For admin inbox: count only user->admin messages (sender == user)
        if (senderId === userId) {
          counts[userId] = (counts[userId] ?? 0) + 1;
        }
      }
      setUnreadByUser(counts);
    } catch {
      // ignore
    }
  }, []);

  const loadThread = React.useCallback(async (userId: string) => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMessagesForUserThread(userId);
      setMessages(rows);
      await markThreadRead({ userId, readerUserId: currentAdminId });
      await loadUnread();
      setTimeout(scrollToBottom, 0);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesajlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [currentAdminId, loadUnread, scrollToBottom]);

  React.useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  React.useEffect(() => {
    if (!selectedUserId) return;
    loadThread(selectedUserId);
  }, [selectedUserId, loadThread]);

  React.useEffect(() => {
    // Realtime: refresh unread counts + active thread
    const channel = supabase
      .channel('admin_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_messages' }, () => {
        loadUnread();
        if (selectedUserId) loadThread(selectedUserId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUnread, loadThread, selectedUserId]);

  const send = async () => {
    if (!selectedUserId) {
      setError('Önce bir kullanıcı seçin');
      return;
    }
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await sendMessageToUserThread({ userId: selectedUserId, senderUserId: currentAdminId, body });
      await loadThread(selectedUserId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesaj gönderilemedi');
    }
  };

  const broadcast = async () => {
    const body = broadcastDraft.trim();
    if (!body) return;
    setBroadcastSending(true);
    setError(null);
    try {
      const r = await broadcastMessageToAll({ senderUserId: currentAdminId, body, includeAdmins });
      setBroadcastDraft('');
      await loadUnread();
      // eslint-disable-next-line no-alert
      alert(`Mesaj gönderildi: ${r.sent} kullanıcı`);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Toplu mesaj gönderilemedi');
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-gray-600" />
            <div className="text-sm font-semibold text-gray-800">Kullanıcılar</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ara (isim/soyisim, kullanıcı, rol)"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto divide-y divide-gray-100">
          {activeUsers.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Kullanıcı bulunamadı.</div>
          ) : (
            activeUsers.map(u => {
              const uid = String(u.id);
              const unread = unreadByUser[uid] ?? 0;
              const isSel = uid === String(selectedUserId);
              return (
                <button
                  key={uid}
                  type="button"
                  onClick={() => setSelectedUserId(uid)}
                  className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${isSel ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">
                        {u.full_name || u.username}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{u.username}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span>
                      {unread > 0 && (
                        <span className="min-w-6 h-6 px-2 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center tabular-nums">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-8 rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-gray-600" />
            <div className="text-sm font-semibold text-gray-800">Mesajlaşma</div>
            <div className="ml-auto text-xs text-gray-500">
              {selectedUser ? `${selectedUser.full_name || selectedUser.username} • ${roleLabel(selectedUser.role)}` : 'Kullanıcı seçin'}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold text-gray-700 mb-2">Toplu Mesaj (Admin → Herkes)</div>
            <textarea
              value={broadcastDraft}
              onChange={(e) => setBroadcastDraft(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Herkese gönderilecek mesaj…"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="text-xs text-gray-600 flex items-center gap-2">
                <input type="checkbox" checked={includeAdmins} onChange={(e) => setIncludeAdmins(e.target.checked)} />
                Admin’lere de gönder
              </label>
              <button
                type="button"
                onClick={broadcast}
                disabled={broadcastSending || !broadcastDraft.trim()}
                className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 ${broadcastSending || !broadcastDraft.trim() ? 'bg-gray-200 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                <Send className="w-4 h-4" />
                {broadcastSending ? 'Gönderiliyor…' : 'Herkese Gönder'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        <div ref={listRef} className="flex-1 overflow-auto p-3 space-y-2 bg-white">
          {loading && messages.length === 0 ? (
            <div className="text-sm text-gray-500">Yükleniyor…</div>
          ) : !selectedUserId ? (
            <div className="text-sm text-gray-500">Mesaj görmek için soldan bir kullanıcı seçin.</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-gray-500">Henüz mesaj yok.</div>
          ) : (
            messages.map((m) => {
              const isMine = String(m.sender_user_id) === String(currentAdminId);
              const senderName = m.sender?.full_name || m.sender?.username || (isMine ? 'Admin' : (selectedUser?.full_name || selectedUser?.username || 'Kullanıcı'));
              const senderRole = m.sender?.role || (isMine ? 'admin' : (selectedUser?.role || 'user'));

              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm border ${isMine ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-800 border-gray-200'}`}>
                    <div className={`text-[11px] ${isMine ? 'text-indigo-100' : 'text-gray-500'} mb-1`}>
                      {senderName} • {roleLabel(senderRole)} • {formatTime(m.created_at)}
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-gray-100 bg-white flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={selectedUserId ? 'Mesaj yaz…' : 'Önce kullanıcı seçin'}
            className="flex-1 h-11 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            disabled={!selectedUserId}
          />
          <button
            type="button"
            onClick={send}
            disabled={!selectedUserId || !draft.trim()}
            className={`h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 ${!selectedUserId || !draft.trim() ? 'bg-gray-200 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            <Send className="w-4 h-4" />
            Gönder
          </button>
        </div>
      </div>
    </div>
  );
}
