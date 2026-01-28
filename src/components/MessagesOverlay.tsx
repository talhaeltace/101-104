import React from 'react';
import { X, Send, MessageSquare, Clock, CheckCheck } from 'lucide-react';
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

function formatTime(ts: string) {
  try {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Dün ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' + 
           date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

function formatDateHeader(ts: string) {
  try {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) return 'Bugün';
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Dün';
    
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  } catch {
    return '';
  }
}

// Group messages by date
function groupMessagesByDate(messages: MessageRow[]): { date: string; messages: MessageRow[] }[] {
  const groups: Record<string, MessageRow[]> = {};
  
  messages.forEach(m => {
    const date = new Date(m.created_at).toDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(m);
  });
  
  return Object.entries(groups).map(([_date, msgs]) => ({
    date: formatDateHeader(msgs[0].created_at),
    messages: msgs
  }));
}

export default function MessagesOverlay({ isOpen, onClose, currentUser }: MessagesOverlayProps) {
  const userId = String(currentUser.id);
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

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
    const id = window.setInterval(() => load(), 5_000);
    return () => window.clearInterval(id);
  }, [isOpen, userId, load]);

  // Focus input when opened
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    
    setSending(true);
    setDraft('');
    
    try {
      await sendMessageToUserThread({ userId, senderUserId: userId, body });
      await load();
      inputRef.current?.focus();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesaj gönderilemedi');
      setDraft(body); // Restore draft on error
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="fixed inset-0 z-[1250] bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Header */}
        <div className="h-14 sm:h-16 px-4 border-b border-gray-200 bg-white shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold text-gray-800 truncate">Mesajlar</div>
              <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Admin ile mesajlaşma
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Kapat"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div className="absolute inset-x-0 top-14 sm:top-16 bottom-20 sm:bottom-24 bg-gray-50">
          <div ref={listRef} className="h-full overflow-auto px-3 sm:px-4 py-4">
            {loading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-3" />
                <p className="text-sm">Mesajlar yükleniyor...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">Henüz mesaj yok</p>
                <p className="text-xs text-gray-400">Admin'e mesaj göndererek başlayın</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    {/* Date Header */}
                    <div className="flex items-center justify-center mb-4">
                      <div className="px-3 py-1 rounded-full bg-gray-200 text-xs text-gray-600 font-medium">
                        {group.date}
                      </div>
                    </div>
                    
                    {/* Messages */}
                    <div className="space-y-2">
                      {group.messages.map((m, mi) => {
                        const isMine = String(m.sender_user_id) === userId;
                        const showAvatar = mi === 0 || String(group.messages[mi - 1].sender_user_id) !== String(m.sender_user_id);
                        
                        return (
                          <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex items-end gap-2 max-w-[85%] ${isMine ? 'flex-row-reverse' : ''}`}>
                              {/* Avatar */}
                              {!isMine && showAvatar && (
                                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                  A
                                </div>
                              )}
                              {!isMine && !showAvatar && <div className="w-8 shrink-0" />}
                              
                              {/* Message Bubble */}
                              <div className={`group relative rounded-2xl px-3.5 py-2.5 ${
                                isMine 
                                  ? 'bg-blue-600 text-white rounded-br-md' 
                                  : 'bg-white text-gray-800 rounded-bl-md border border-gray-200 shadow-sm'
                              }`}>
                                <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                  {m.body}
                                </div>
                                <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span className={`text-[10px] ${isMine ? 'text-blue-200' : 'text-gray-500'}`}>
                                    {formatTime(m.created_at)}
                                  </span>
                                  {isMine && (
                                    <CheckCheck className="w-3 h-3 text-blue-200 ml-1" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute inset-x-0 bottom-0 px-3 sm:px-4 py-3 sm:py-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Mesaj yazın..."
                className="w-full h-12 sm:h-14 rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                disabled={sending}
              />
            </div>
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.trim()}
              className={`h-12 sm:h-14 w-12 sm:w-14 rounded-xl flex items-center justify-center transition-all ${
                sending || !draft.trim()
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
              }`}
            >
              {sending ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          
          {/* Typing hint */}
          <div className="mt-2 text-center">
            <span className="text-[10px] text-gray-500">Enter ile gönder</span>
          </div>
        </div>
      </div>
    </div>
  );
}
