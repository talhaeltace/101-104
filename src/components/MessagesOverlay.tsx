import React from 'react';
import { X, Send, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AuthUser } from '../lib/authUser';
import {
  fetchMessagesForUserThread,
  markThreadRead,
  sendMessageToUserThread,
  type MessageRow,
} from '../lib/messages';

type MessagesOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser;
};

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

export default function MessagesOverlay({ isOpen, onClose, currentUser }: MessagesOverlayProps) {
  const userId = String(currentUser.id);
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToBottom = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const load = React.useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMessagesForUserThread(userId);
      setMessages(rows);
      // Mark admin-sent messages read
      await markThreadRead({ userId, readerUserId: userId });
      setTimeout(scrollToBottom, 0);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesajlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [isOpen, scrollToBottom, userId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!isOpen) return;

    const channel = supabase
      .channel(`messages_user_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_messages', filter: `user_id=eq.${userId}` },
        () => {
          // reload on any change for simplicity
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, userId, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await sendMessageToUserThread({ userId, senderUserId: userId, body });
      // Realtime will reload, but keep UI snappy
      await load();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesaj gönderilemedi');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1250] bg-black/40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-14 sm:h-16 px-4 border-b border-gray-100 bg-white/90 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold text-gray-800 truncate">Mesajlar</div>
              <div className="text-xs text-gray-500 truncate">Admin ile mesajlaşma</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-700"
            aria-label="Kapat"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="absolute inset-x-0 top-14 sm:top-16 bottom-16">
          <div ref={listRef} className="h-full overflow-auto px-4 py-3 space-y-2">
            {loading && messages.length === 0 ? (
              <div className="text-sm text-gray-500">Yükleniyor…</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-gray-500">Henüz mesaj yok. Admin’e yazabilirsiniz.</div>
            ) : (
              messages.map((m) => {
                const isMine = String(m.sender_user_id) === userId;
                const senderName = m.sender?.full_name || m.sender?.username || (isMine ? currentUser.full_name || currentUser.username : 'Admin');
                const senderRole = m.sender?.role || (isMine ? currentUser.role : 'admin');

                return (
                  <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm border ${isMine ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-800 border-gray-200'}`}>
                      <div className={`text-[11px] ${isMine ? 'text-indigo-100' : 'text-gray-500'} mb-1`}
                      >
                        {senderName} • {roleLabel(senderRole)} • {formatTime(m.created_at)}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-16 px-4 border-t border-gray-100 bg-white flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Mesaj yaz…"
            className="flex-1 h-11 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="button"
            onClick={send}
            className="h-11 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Gönder
          </button>
        </div>
      </div>
    </div>
  );
}
