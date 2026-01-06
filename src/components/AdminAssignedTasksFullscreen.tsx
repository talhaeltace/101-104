import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { listTasksCreatedByUser, updateTaskStatus, type Task } from '../lib/tasks';

interface Props {
  currentUserId: string;
  onClose: () => void;
}

export default function AdminAssignedTasksFullscreen({ currentUserId, onClose }: Props) {
  useBodyScrollLock(true);

  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  const loadAssignedTasks = async () => {
    try {
      setTasksLoading(true);
      const list = await listTasksCreatedByUser(currentUserId);
      setAssignedTasks(list);
    } catch (e) {
      console.warn('loadAssignedTasks failed', e);
      setAssignedTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    loadAssignedTasks();

    const channel = supabase
      .channel(`tasks_created_fullscreen_${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `created_by_user_id=eq.${currentUserId}` },
        () => {
          loadAssignedTasks();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="fixed inset-0 z-[1400] bg-white">
      <div className="h-14 border-b border-gray-100 bg-white/90 backdrop-blur-md flex items-center justify-between px-4">
        <div className="text-sm font-semibold text-gray-900">Atanan Görevler</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAssignedTasks}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {tasksLoading ? 'Yükleniyor…' : 'Yenile'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg">{error}</div>
      )}

      <div className="h-[calc(100vh-3.5rem)] overflow-auto bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800">Senin atadığın görevler</div>
                <div className="text-xs text-gray-500">({assignedTasks.length})</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-white">
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Görev</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Kullanıcı</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Durum</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Lokasyon</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Tarih</th>
                    <th className="p-3 text-center text-sm font-semibold text-gray-600">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {assignedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-sm text-gray-500">
                        Henüz görev atanmadı
                      </td>
                    </tr>
                  ) : (
                    assignedTasks.map((t) => {
                      const routeCount = Array.isArray(t.routeLocationIds) ? t.routeLocationIds.length : 0;
                      const canCancel = t.status === 'assigned' || t.status === 'in_progress';
                      return (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="p-3">
                            <div className="font-medium text-gray-900">{t.title}</div>
                            <div className="text-xs text-gray-500">{t.regionName ?? '-'}</div>
                          </td>
                          <td className="p-3 text-sm text-gray-700">{t.assignedToUsername ?? t.assignedToUserId}</td>
                          <td className="p-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{t.status}</span>
                          </td>
                          <td className="p-3 text-sm text-gray-700">{routeCount}</td>
                          <td className="p-3 text-sm text-gray-500">{formatDate(t.createdAt)}</td>
                          <td className="p-3 text-center">
                            {canCancel ? (
                              <button
                                onClick={async () => {
                                  const ok = confirm('Bu görevi iptal etmek istiyor musunuz?');
                                  if (!ok) return;
                                  const success = await updateTaskStatus(t.id, 'cancelled');
                                  if (!success) setError('Görev iptal edilemedi');
                                }}
                                className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                              >
                                İptal
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
