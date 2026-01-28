import React from 'react';
import { X, MessageSquareText, Users, Search, Send, Clock, CheckCheck, Megaphone, ChevronLeft } from 'lucide-react';
import type { AppUser } from '../lib/userPermissions';
import { listUsers } from '../lib/userPermissions';
import { apiFetch } from '../lib/apiClient';
import {
  broadcastMessageToAll,
  fetchMessagesForUserThread,
  markThreadRead,
  sendMessageToUserThread,
  type MessageRow,
} from '../lib/messages';

type AdminMessagesOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  currentAdminId: string;
};

function roleBadge(role: string) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return 'bg-red-100 text-red-600 border-red-200';
  if (r === 'editor') return 'bg-blue-100 text-blue-600 border-blue-200';
  if (r === 'viewer') return 'bg-gray-100 text-gray-600 border-gray-200';
  return 'bg-emerald-100 text-emerald-600 border-emerald-200';
}

function roleLabel(role?: string | null) {
  const r = String(role ?? '').toLowerCase();
  if (r === 'admin') return 'Admin';
  if (r === 'editor') return 'Editör';
  if (r === 'viewer') return 'İzleyici';
  return 'Kullanıcı';
}

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

export default function AdminMessagesOverlay({ isOpen, onClose, currentAdminId }: AdminMessagesOverlayProps) {
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [unreadByUser, setUnreadByUser] = React.useState<Record<string, number>>({});
  const [showBroadcast, setShowBroadcast] = React.useState(false);
  const [broadcastDraft, setBroadcastDraft] = React.useState('');
  const [includeAdmins, setIncludeAdmins] = React.useState(false);
  const [broadcastSending, setBroadcastSending] = React.useState(false);
  
  // Mobile: show user list or chat
  const [mobileView, setMobileView] = React.useState<'list' | 'chat'>('list');
  
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const scrollToBottom = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const loadUsers = React.useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listUsers();
      setUsers(rows);
    } catch {
      setError('Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  const loadUnread = React.useCallback(async () => {
    try {
      const res = await apiFetch('/messages/admin/unread-counts');
      setUnreadByUser(((res as any)?.data ?? {}) as Record<string, number>);
    } catch {
      // ignore
    }
  }, []);

  const loadThread = React.useCallback(async (userId: string) => {
    if (!userId) return;
    setMessagesLoading(true);
    try {
      const rows = await fetchMessagesForUserThread(userId);
      setMessages(rows);
      await markThreadRead({ userId, readerUserId: currentAdminId });
      await loadUnread();
      setTimeout(scrollToBottom, 0);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesajlar yüklenemedi');
    } finally {
      setMessagesLoading(false);
    }
  }, [currentAdminId, loadUnread, scrollToBottom]);

  React.useEffect(() => {
    loadUsers();
    loadUnread();
  }, [loadUsers, loadUnread]);

  React.useEffect(() => {
    if (!selectedUserId) return;
    loadThread(selectedUserId);
  }, [selectedUserId, loadThread]);

  React.useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => {
      loadUnread();
      if (selectedUserId) loadThread(selectedUserId);
    }, 5_000);
    return () => window.clearInterval(id);
  }, [isOpen, loadUnread, loadThread, selectedUserId]);

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

  const send = async () => {
    if (!selectedUserId) {
      setError('Önce bir kullanıcı seçin');
      return;
    }
    const body = draft.trim();
    if (!body || sending) return;
    
    setSending(true);
    setDraft('');
    
    try {
      await sendMessageToUserThread({ userId: selectedUserId, senderUserId: currentAdminId, body });
      await loadThread(selectedUserId);
      inputRef.current?.focus();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Mesaj gönderilemedi');
      setDraft(body);
    } finally {
      setSending(false);
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
      setShowBroadcast(false);
      await loadUnread();
      alert(`Mesaj ${r.sent} kullanıcıya gönderildi`);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Toplu mesaj gönderilemedi');
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleSelectUser = (uid: string) => {
    setSelectedUserId(uid);
    setMobileView('chat');
  };

  const handleBackToList = () => {
    setMobileView('list');
  };

  if (!isOpen) return null;

  const groupedMessages = groupMessagesByDate(messages);
  const totalUnread = Object.values(unreadByUser).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-[1250] bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-gray-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Header */}
        <div className="h-14 sm:h-16 px-4 border-b border-gray-200 bg-white shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile back button */}
            {mobileView === 'chat' && (
              <button
                onClick={handleBackToList}
                className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
              <MessageSquareText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold text-gray-800 truncate flex items-center gap-2">
                Mesajlar
                {totalUnread > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {mobileView === 'chat' && selectedUser
                  ? `${selectedUser.full_name || selectedUser.username}`
                  : 'Kullanıcılarla mesajlaşma'
                }
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBroadcast(!showBroadcast)}
              className={`p-2.5 rounded-xl transition-colors ${
                showBroadcast 
                  ? 'bg-amber-100 text-amber-600' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
              title="Toplu Mesaj"
            >
              <Megaphone className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="absolute top-16 sm:top-20 inset-x-4 z-50 p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Broadcast Modal */}
        {showBroadcast && (
          <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">Toplu Mesaj</h3>
                    <p className="text-xs text-gray-500">Tüm kullanıcılara mesaj gönder</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBroadcast(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Modal Body */}
              <div className="p-4">
                <textarea
                  value={broadcastDraft}
                  onChange={(e) => setBroadcastDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                  placeholder="Herkese gönderilecek mesaj..."
                  autoFocus
                />
                
                <label className="mt-3 text-xs text-gray-500 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAdmins}
                    onChange={(e) => setIncludeAdmins(e.target.checked)}
                    className="rounded border-gray-300 bg-gray-50 text-amber-600 focus:ring-amber-500"
                  />
                  Admin'lere de gönder
                </label>
              </div>
              
              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowBroadcast(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={broadcast}
                  disabled={broadcastSending || !broadcastDraft.trim()}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-all ${
                    broadcastSending || !broadcastDraft.trim()
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-amber-600 text-white hover:bg-amber-500 shadow-lg shadow-amber-500/20'
                  }`}
                >
                  {broadcastSending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Herkese Gönder
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="absolute inset-x-0 top-14 sm:top-16 bottom-0">
          <div className="h-full flex">
            {/* Users List - Hidden on mobile when in chat */}
            <div className={`${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 flex-col border-r border-gray-200 bg-white`}>
              {/* Search */}
              <div className="p-3 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Kullanıcı ara..."
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {/* User List */}
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                  </div>
                ) : activeUsers.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">
                    Kullanıcı bulunamadı
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {activeUsers.map(u => {
                      const uid = String(u.id);
                      const unread = unreadByUser[uid] ?? 0;
                      const isSel = uid === String(selectedUserId);
                      
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => handleSelectUser(uid)}
                          className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                            isSel ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                              {(u.full_name || u.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-800 truncate">
                                  {u.full_name || u.username}
                                </span>
                                {unread > 0 && (
                                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                    {unread > 99 ? '99+' : unread}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-500 truncate">{u.username}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${roleBadge(u.role)}`}>
                                  {roleLabel(u.role)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Chat Area - Hidden on mobile when in list */}
            <div className={`${mobileView === 'list' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col bg-gray-50`}>
              {!selectedUserId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 px-6 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                    <Users className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Kullanıcı seçin</p>
                  <p className="text-xs text-gray-500">Mesajlaşmak için soldan bir kullanıcı seçin</p>
                </div>
              ) : (
                <>
                  {/* Messages */}
                  <div ref={listRef} className="flex-1 overflow-auto px-3 sm:px-4 py-4">
                    {messagesLoading && messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <MessageSquareText className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-sm">Henüz mesaj yok</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {groupedMessages.map((group, gi) => (
                          <div key={gi}>
                            <div className="flex items-center justify-center mb-4">
                              <div className="px-3 py-1 rounded-full bg-gray-200 text-xs text-gray-600 font-medium">
                                {group.date}
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              {group.messages.map((m, mi) => {
                                const isMine = String(m.sender_user_id) === String(currentAdminId);
                                const showAvatar = mi === 0 || String(group.messages[mi - 1].sender_user_id) !== String(m.sender_user_id);
                                
                                return (
                                  <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex items-end gap-2 max-w-[85%] ${isMine ? 'flex-row-reverse' : ''}`}>
                                      {!isMine && showAvatar && (
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                          {(selectedUser?.full_name || selectedUser?.username || 'U').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      {!isMine && !showAvatar && <div className="w-8 shrink-0" />}
                                      
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
                                          {isMine && <CheckCheck className="w-3 h-3 text-blue-200 ml-1" />}
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

                  {/* Input */}
                  <div className="p-3 sm:p-4 border-t border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center gap-2 sm:gap-3">
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
                        className="flex-1 h-12 sm:h-14 rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        disabled={sending}
                      />
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
