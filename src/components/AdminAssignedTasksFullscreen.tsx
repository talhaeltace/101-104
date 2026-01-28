import { useCallback, useEffect, useState } from 'react';
import { 
  ListTodo, X, RefreshCw, CheckCircle2, Clock, Play, XCircle, 
  MapPin, User, Calendar, AlertCircle, Search, Target,
  ChevronDown, Inbox, Ban
} from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { listTasksCreatedByUser, updateTaskStatus, type Task } from '../lib/tasks';

interface Props {
  currentUserId: string;
  onClose: () => void;
}

type FilterType = 'all' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  assigned: {
    label: 'Atandı',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
    icon: Clock
  },
  in_progress: {
    label: 'Devam Ediyor',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
    icon: Play
  },
  completed: {
    label: 'Tamamlandı',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/30',
    icon: CheckCircle2
  },
  cancelled: {
    label: 'İptal',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/30',
    icon: XCircle
  }
};

export default function AdminAssignedTasksFullscreen({ currentUserId, onClose }: Props) {
  useBodyScrollLock(true);

  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return '-';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} saat önce`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} gün önce`;
    return formatDate(dateStr);
  };

  const loadAssignedTasks = useCallback(async () => {
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
  }, [currentUserId]);

  const handleCancelTask = async (task: Task) => {
    const ok = confirm(`"${task.title}" görevini iptal etmek istiyor musunuz?`);
    if (!ok) return;

    setProcessingId(task.id);
    const success = await updateTaskStatus(task.id, 'cancelled');
    setProcessingId(null);

    if (!success) {
      setError('Görev iptal edilemedi');
      return;
    }
    setSuccessMessage('Görev iptal edildi');
    await loadAssignedTasks();
  };

  useEffect(() => {
    loadAssignedTasks();
    const id = window.setInterval(() => loadAssignedTasks(), 10_000);
    return () => window.clearInterval(id);
  }, [loadAssignedTasks]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Stats
  const stats = {
    total: assignedTasks.length,
    assigned: assignedTasks.filter(t => t.status === 'assigned').length,
    inProgress: assignedTasks.filter(t => t.status === 'in_progress').length,
    completed: assignedTasks.filter(t => t.status === 'completed').length,
    cancelled: assignedTasks.filter(t => t.status === 'cancelled').length
  };

  // Filtered tasks
  const filteredTasks = assignedTasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || 
             t.assignedToUsername?.toLowerCase().includes(q) ||
             t.regionName?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50">
      <div className="w-full h-full flex flex-col">

        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 rounded-xl">
                <ListTodo className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Atanan Görevler</h1>
                <p className="text-xs text-gray-500">Senin atadığın görevler</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={loadAssignedTasks}
                disabled={tasksLoading}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${tasksLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="px-4 pb-4 bg-gray-50">
            <div className="grid grid-cols-5 gap-2">
              <div className="bg-white rounded-xl p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-gray-500" />
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">Toplam</span>
                </div>
                <div className="text-xl font-bold text-gray-800">{stats.total}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-[10px] uppercase tracking-wide text-amber-600">Atandı</span>
                </div>
                <div className="text-xl font-bold text-amber-700">{stats.assigned}</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Play className="w-4 h-4 text-blue-600" />
                  <span className="text-[10px] uppercase tracking-wide text-blue-600">Devam</span>
                </div>
                <div className="text-xl font-bold text-blue-700">{stats.inProgress}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-[10px] uppercase tracking-wide text-green-600">Biten</span>
                </div>
                <div className="text-xl font-bold text-green-700">{stats.completed}</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-[10px] uppercase tracking-wide text-red-600">İptal</span>
                </div>
                <div className="text-xl font-bold text-red-700">{stats.cancelled}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Search & Filter Bar */}
        <div className="shrink-0 px-4 py-3 bg-white border-b border-gray-200">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Görev, kullanıcı veya bölge ara..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {([
                { key: 'all', label: 'Tümü' },
                { key: 'assigned', label: 'Atandı' },
                { key: 'in_progress', label: 'Devam' },
                { key: 'completed', label: 'Biten' }
              ] as { key: FilterType; label: string }[]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    filter === f.key 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-4 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-400">{successMessage}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tasksLoading && assignedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-500">Görevler yükleniyor...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-gray-100 rounded-2xl mb-4">
                <Inbox className="w-12 h-12 text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-600">
                {searchQuery || filter !== 'all' ? 'Sonuç bulunamadı' : 'Henüz görev atanmadı'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery || filter !== 'all' ? 'Farklı bir filtre deneyin' : 'Ekip panelinden görev atayabilirsiniz'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const config = statusConfig[task.status] || statusConfig.assigned;
                const StatusIcon = config.icon;
                const isExpanded = expandedTaskId === task.id;
                const isProcessing = processingId === task.id;
                const routeCount = Array.isArray(task.routeLocationIds) ? task.routeLocationIds.length : 0;
                const canCancel = task.status === 'assigned' || task.status === 'in_progress';

                return (
                  <div 
                    key={task.id} 
                    className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all ${config.borderColor} ${
                      isProcessing ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Task Header */}
                    <div 
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Status Icon */}
                        <div className={`p-3 rounded-xl ${config.bgColor} border ${config.borderColor}`}>
                          <StatusIcon className={`w-5 h-5 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-gray-800 truncate">{task.title}</h3>
                            <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${config.bgColor} ${config.color}`}>
                              {config.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {task.assignedToUsername || task.assignedToUserId}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {routeCount} lokasyon
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatTimeAgo(task.createdAt)}
                            </span>
                          </div>

                          {task.regionName && (
                            <div className="mt-2">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600">
                                <Target className="w-3 h-3" />
                                {task.regionName}
                              </span>
                            </div>
                          )}
                        </div>

                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <div className="pt-4 space-y-3">
                          {/* Task Details */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-gray-50 rounded-xl p-3">
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Atanan Kullanıcı</div>
                              <div className="text-sm text-gray-800 font-medium flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                                  {(task.assignedToUsername || 'U').charAt(0).toUpperCase()}
                                </div>
                                {task.assignedToUsername || task.assignedToUserId}
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Lokasyon Sayısı</div>
                              <div className="text-sm text-gray-800 font-medium flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                {routeCount} yer
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Oluşturulma</div>
                              <div className="text-sm text-gray-800 font-medium">{formatDate(task.createdAt)}</div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Bölge</div>
                              <div className="text-sm text-gray-800 font-medium">{task.regionName || '-'}</div>
                            </div>
                          </div>

                          {/* Description */}
                          {task.description && (
                            <div className="bg-gray-50 rounded-xl p-3">
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Açıklama</div>
                              <div className="text-sm text-gray-600">{task.description}</div>
                            </div>
                          )}

                          {/* Timestamps */}
                          <div className="grid grid-cols-3 gap-2">
                            {task.startedAt && (
                              <div className="bg-blue-50 rounded-xl p-2 border border-blue-200">
                                <div className="text-[10px] uppercase text-blue-600">Başladı</div>
                                <div className="text-xs text-blue-700 font-medium">{formatDate(task.startedAt)}</div>
                              </div>
                            )}
                            {task.completedAt && (
                              <div className="bg-green-50 rounded-xl p-2 border border-green-200">
                                <div className="text-[10px] uppercase text-green-600">Tamamlandı</div>
                                <div className="text-xs text-green-700 font-medium">{formatDate(task.completedAt)}</div>
                              </div>
                            )}
                            {task.cancelledAt && (
                              <div className="bg-red-50 rounded-xl p-2 border border-red-200">
                                <div className="text-[10px] uppercase text-red-600">İptal</div>
                                <div className="text-xs text-red-700 font-medium">{formatDate(task.cancelledAt)}</div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          {canCancel && (
                            <button
                              onClick={() => handleCancelTask(task)}
                              disabled={isProcessing}
                              className="w-full px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2 border border-red-200"
                            >
                              {isProcessing ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Ban className="w-4 h-4" />
                                  Görevi İptal Et
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 px-4 py-3 bg-white border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              {assignedTasks.length} görev atandı
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Her 10 saniyede güncellenir
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
