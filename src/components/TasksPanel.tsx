import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  ClipboardList, RefreshCw, X, Play, CheckCircle2, Clock, 
  AlertCircle, MapPin, User, Calendar, ChevronRight,
  Zap, Target, BarChart3, Search, ArrowUpRight
} from 'lucide-react';
import type { Task } from '../lib/tasks';
import { listTasksForUser } from '../lib/tasks';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onStartTask: (task: Task) => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  assigned: { label: 'Atandı', color: 'text-amber-400', bgColor: 'bg-amber-500/20', icon: Clock },
  in_progress: { label: 'Devam Ediyor', color: 'text-blue-400', bgColor: 'bg-blue-500/20', icon: Play },
  completed: { label: 'Tamamlandı', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', icon: CheckCircle2 },
  cancelled: { label: 'İptal', color: 'text-red-400', bgColor: 'bg-red-500/20', icon: AlertCircle }
};

type FilterType = 'all' | 'assigned' | 'in_progress' | 'completed';

const TasksPanel: React.FC<Props> = ({ isOpen, onClose, userId, onStartTask }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(isOpen);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await listTasksForUser(userId);
      setTasks(list);
    } catch {
      setError('Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
    const id = window.setInterval(() => load(), 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  // Stats
  const stats = useMemo(() => {
    const assigned = tasks.filter(t => t.status === 'assigned').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const totalLocations = tasks.reduce((sum, t) => sum + (t.routeLocationIds?.length || 0), 0);
    return { assigned, inProgress, completed, total: tasks.length, totalLocations };
  }, [tasks]);

  // Filtered & sorted tasks
  const visibleTasks = useMemo(() => {
    let filtered = tasks;
    
    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(t => t.status === filter);
    }
    
    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.regionName?.toLowerCase().includes(q)
      );
    }
    
    // Sort: in_progress first, then assigned, then completed
    const score = (t: Task) => (t.status === 'in_progress' ? 0 : t.status === 'assigned' ? 1 : 2);
    return [...filtered].sort((a, b) => score(a) - score(b));
  }, [tasks, filter, searchQuery]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50 overflow-hidden">
      <div ref={panelRef} className="w-full h-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm safe-area-top">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl shadow-sm shrink-0">
                <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">Görevlerim</h1>
                <p className="text-[10px] sm:text-xs text-gray-500">Atanan görevleri takip edin</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={load}
                disabled={loading}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                title="Yenile"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={onClose} 
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Stats Cards - 2x2 on mobile, 4 cols on larger */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 bg-gray-50">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              <div className="bg-white rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">Toplam</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-gray-800">{stats.total}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-amber-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-amber-600">Bekleyen</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-amber-700">{stats.assigned}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-blue-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-blue-600">Aktif</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-blue-700">{stats.inProgress}</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-green-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Target className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-green-600">Biten</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-green-700">{stats.completed}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Search & Filter Bar */}
        <div className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 bg-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Görev ara..."
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 placeholder-gray-400 text-xs sm:text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>
            <div className="flex rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 self-start">
              {([
                { key: 'all', label: 'Tümü' },
                { key: 'assigned', label: 'Bekleyen' },
                { key: 'in_progress', label: 'Aktif' },
                { key: 'completed', label: 'Biten' }
              ] as { key: FilterType; label: string }[]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors ${
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

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 overflow-x-hidden">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl mb-3 shadow-sm">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-500" />
              </div>
              <p className="text-red-600 font-medium text-sm sm:text-base">{error}</p>
              <button onClick={load} className="mt-3 sm:mt-4 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 shadow-sm">
                Tekrar Dene
              </button>
            </div>
          ) : loading && tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
                <RefreshCw className="relative w-10 h-10 sm:w-12 sm:h-12 animate-spin text-blue-600" />
              </div>
              <p className="text-gray-500 mt-4 text-sm sm:text-base">Görevler yükleniyor...</p>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl mb-3 shadow-sm">
                <ClipboardList className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-600 text-center">
                {filter !== 'all' ? 'Bu filtrede görev yok' : 'Henüz görev yok'}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center">
                {filter !== 'all' ? 'Filtreyi değiştirin veya tümünü görün' : 'Görev atandığında burada görünecek'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {visibleTasks.map((task) => {
                const config = statusConfig[task.status] || statusConfig.assigned;
                const StatusIcon = config.icon;
                const canStart = task.status === 'assigned';
                const isActive = task.status === 'in_progress';
                const isCompleted = task.status === 'completed';
                const routeCount = task.routeLocationIds?.length || 0;
                const isExpanded = expandedTaskId === task.id;

                return (
                  <div 
                    key={task.id} 
                    className={`rounded-xl sm:rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md ${
                      isActive 
                        ? 'bg-blue-50 border-blue-200' 
                        : isCompleted
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Task Card Header */}
                    <div 
                      className="p-2.5 sm:p-4 cursor-pointer"
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* Status Icon */}
                        <div className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl ${config.bgColor} shrink-0`}>
                          <StatusIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <h3 className={`font-semibold truncate text-sm sm:text-base ${isCompleted ? 'text-gray-500' : 'text-gray-800'}`}>
                              {task.title}
                            </h3>
                            {isActive && (
                              <span className="px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide bg-blue-500 text-white rounded-full animate-pulse shrink-0">
                                Aktif
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-gray-500">
                            <span className={`flex items-center gap-0.5 sm:gap-1 ${config.color}`}>
                              <StatusIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              {config.label}
                            </span>
                            {task.regionName && (
                              <span className="flex items-center gap-0.5 sm:gap-1">
                                <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                <span className="truncate max-w-[80px] sm:max-w-none">{task.regionName}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-0.5 sm:gap-1">
                              <Target className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              {routeCount} lok.
                            </span>
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="shrink-0 flex items-center gap-1 sm:gap-2">
                          {(canStart || isActive) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartTask(task);
                              }}
                              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 sm:gap-2 transition-all ${
                                isActive
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  <span className="hidden xs:inline">Devam Et</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  <span className="hidden xs:inline">Başlat</span>
                                </>
                              )}
                            </button>
                          )}
                          <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-2.5 sm:px-4 pb-2.5 sm:pb-4 border-t border-gray-100">
                        <div className="pt-2.5 sm:pt-4 space-y-2 sm:space-y-3">
                          {/* Description */}
                          {task.description && (
                            <div className="p-2 sm:p-3 bg-gray-50 rounded-lg sm:rounded-xl">
                              <p className="text-xs sm:text-sm text-gray-600 whitespace-pre-line">{task.description}</p>
                            </div>
                          )}
                          
                          {/* Meta Info */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                            {task.createdByUsername && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500">
                                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                                <span className="truncate">Atayan: <span className="text-gray-800">{task.createdByUsername}</span></span>
                              </div>
                            )}
                            {task.createdAt && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500">
                                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                                <span className="truncate">Oluşturulma: <span className="text-gray-800">{formatDate(task.createdAt)}</span></span>
                              </div>
                            )}
                            {task.startedAt && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500">
                                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                                <span className="truncate">Başlangıç: <span className="text-gray-800">{formatDate(task.startedAt)}</span></span>
                              </div>
                            )}
                            {task.completedAt && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500">
                                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                                <span className="truncate">Bitiş: <span className="text-gray-800">{formatDate(task.completedAt)}</span></span>
                              </div>
                            )}
                          </div>

                          {/* Location Count Progress */}
                          {routeCount > 0 && (
                            <div className="pt-1 sm:pt-2">
                              <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-500 mb-1.5 sm:mb-2">
                                <span>Rota Lokasyonları</span>
                                <span className="text-gray-800 font-medium">{routeCount} nokta</span>
                              </div>
                              <div className="flex gap-0.5 sm:gap-1">
                                {Array.from({ length: Math.min(routeCount, 20) }).map((_, i) => (
                                  <div 
                                    key={i} 
                                    className={`h-1 sm:h-1.5 flex-1 rounded-full ${
                                      isCompleted ? 'bg-green-500' : isActive ? 'bg-blue-500' : 'bg-gray-300'
                                    }`}
                                  />
                                ))}
                                {routeCount > 20 && (
                                  <span className="text-[9px] sm:text-xs text-gray-400">+{routeCount - 20}</span>
                                )}
                              </div>
                            </div>
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

        {/* Footer Stats */}
        <footer className="shrink-0 px-3 sm:px-4 py-2 sm:py-3 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-500">
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
              Toplam {stats.totalLocations} lokasyon
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden xs:inline">Her 10 saniyede</span> güncellenir
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TasksPanel;
