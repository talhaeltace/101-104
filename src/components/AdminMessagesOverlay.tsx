import React from 'react';
import { X, MessageSquareText } from 'lucide-react';
import type { AppUser } from '../lib/userPermissions';
import { listUsers } from '../lib/userPermissions';
import AdminMessagesTab from './AdminMessagesTab';

type AdminMessagesOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  currentAdminId: string;
};

export default function AdminMessagesOverlay({ isOpen, onClose, currentAdminId }: AdminMessagesOverlayProps) {
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1250] bg-black/40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-14 sm:h-16 px-4 border-b border-gray-100 bg-white/90 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="w-5 h-5 text-indigo-600" />
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold text-gray-800 truncate">Mesajlar</div>
              <div className="text-xs text-gray-500 truncate">Kullanıcılarla mesajlaşma</div>
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

        <div className="absolute inset-x-0 top-14 sm:top-16 bottom-0 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : (
            <AdminMessagesTab currentAdminId={currentAdminId} users={users} />
          )}
        </div>
      </div>
    </div>
  );
}
