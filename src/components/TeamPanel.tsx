import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Users, Navigation, CheckCircle2, Clock, X, RefreshCw, 
  ChevronRight, Car, Briefcase, Timer, 
  ListChecks, Search, Zap,
  Eye, UserCheck, Route, Play, AlertCircle
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import type { Region } from '../data/regions';
import { createTask, type Task } from '../lib/tasks';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

// Extended interface with detailed tracking fields
export interface TeamMemberStatus {
  id: string;
  user_id: string;
  username: string;
  status: 'idle' | 'yolda' | 'adreste' | 'tamamladi';
  current_location_id: string | null;
  current_location_name: string | null;
  next_location_name: string | null;
  total_route_count: number;
  completed_count: number;
  current_lat: number | null;
  current_lng: number | null;
  last_updated_at: string;
  route_started_at: string | null;
  completed_locations: CompletedLocationRecord[] | null;
  current_leg_start_time: string | null;
  total_travel_minutes: number;
  total_work_minutes: number;
  today_completed_count: number;
  today_started_at: string | null;
  is_working: boolean;
  work_start_time: string | null;
}

interface CompletedLocationRecord {
  id: number | string;
  name: string;
  regionName?: string;
  arrivedAt: string;
  completedAt: string;
  workDurationMinutes: number;
  travelDurationMinutes: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onFocusMember?: (memberId: string, username: string, lat: number, lng: number) => void;
  currentUserId: string | null;
  currentUsername: string | null;
  regions: Region[];
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; dotColor: string; icon: React.ElementType }> = {
  idle: {
    label: 'Beklemede',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/20',
    borderColor: 'border-slate-500/30',
    dotColor: 'bg-slate-400',
    icon: Clock
  },
  yolda: {
    label: 'Yolda',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
    dotColor: 'bg-blue-500',
    icon: Car
  },
  adreste: {
    label: 'Adreste',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30',
    dotColor: 'bg-amber-500',
    icon: Briefcase
  },
  tamamladi: {
    label: 'Tamamladı',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/30',
    dotColor: 'bg-emerald-500',
    icon: CheckCircle2
  }
};

const formatTimeAgo = (isoString: string) => {
  const now = new Date();
  const updated = new Date(isoString);
  const diffMs = now.getTime() - updated.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} saat önce`;
  
  return updated.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const formatLiveDuration = (startIso: string | null) => {
  if (!startIso) return '';
  const start = new Date(startIso);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins} dk`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}s ${mins}dk`;
};

const formatTime = (isoString: string) => {
  return new Date(isoString).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

type FilterType = 'all' | 'active' | 'idle';

const TeamPanel: React.FC<Props> = ({ isOpen, onClose, onFocusMember, currentUserId, currentUsername, regions }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMemberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  
  useBodyScrollLock(isOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  const [memberCurrentTask, setMemberCurrentTask] = useState<Record<string, Task | null>>({});

  // Task details modal
  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(false);
  const [taskDetailsMember, setTaskDetailsMember] = useState<TeamMemberStatus | null>(null);
  const [taskDetailsTask, setTaskDetailsTask] = useState<Task | null>(null);

  // Task assignment modal state
  const [isAssignTaskModalOpen, setIsAssignTaskModalOpen] = useState(false);
  const [taskMember, setTaskMember] = useState<TeamMemberStatus | null>(null);
  const [taskRegionId, setTaskRegionId] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [selectedTaskLocationIds, setSelectedTaskLocationIds] = useState<string[]>([]);
  const [assigningTask, setAssigningTask] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const fetchCurrentTasksForMembers = useCallback(async (members: TeamMemberStatus[]) => {
    try {
      const userIds = (members || []).map(m => m.user_id).filter(Boolean);
      if (userIds.length === 0) { setMemberCurrentTask({}); return; }
      const qs = new URLSearchParams({ user_ids: userIds.join(',') });
      const res = await apiFetch(`/tasks/active?${qs.toString()}`);
      const data = ((res as any)?.data ?? []) as any[];
      const byUser: Record<string, Task | null> = {};
      for (const uid of userIds) byUser[uid] = null;
      const rows: Task[] = (data || []).map((r: any) => ({
        id: r.id, title: r.title, description: r.description, createdAt: r.created_at,
        createdByUserId: r.created_by_user_id, createdByUsername: r.created_by_username,
        assignedToUserId: r.assigned_to_user_id, assignedToUsername: r.assigned_to_username,
        regionId: r.region_id, regionName: r.region_name,
        routeLocationIds: Array.isArray(r.route_location_ids) ? r.route_location_ids : [],
        status: r.status, startedAt: r.started_at, completedAt: r.completed_at, cancelledAt: r.cancelled_at
      }));
      for (const t of rows) {
        const uid = t.assignedToUserId;
        const existing = byUser[uid];
        if (!existing) { byUser[uid] = t; continue; }
        if (existing.status !== 'in_progress' && t.status === 'in_progress') byUser[uid] = t;
      }
      setMemberCurrentTask(byUser);
    } catch (e) { console.warn('fetchCurrentTasksForMembers exception', e); }
  }, []);

  // Fetch team status
  const fetchTeamStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/team-status');
      const data = ((res as any)?.data ?? []) as any[];
      const sorted = (data || []).sort((a, b) => {
        if (a.status === 'idle' && b.status !== 'idle') return 1;
        if (a.status !== 'idle' && b.status === 'idle') return -1;
        return new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime();
      });
      setTeamMembers(sorted);
      fetchCurrentTasksForMembers(sorted);
    } catch (err) {
      console.error('Team status error:', err);
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [fetchCurrentTasksForMembers]);

  useEffect(() => {
    if (!isOpen) return;
    fetchTeamStatus();
  }, [fetchTeamStatus, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => fetchTeamStatus(), 30000);
    return () => clearInterval(interval);
  }, [fetchTeamStatus, isOpen]);

  // Stats
  const activeMembers = teamMembers.filter(m => m.status !== 'idle');
  const idleMembers = teamMembers.filter(m => m.status === 'idle');
  const totalTodayCompleted = teamMembers.reduce((sum, m) => sum + (m.today_completed_count || 0), 0);
  const totalInRoute = teamMembers.reduce((sum, m) => sum + (m.total_route_count || 0), 0);

  // Filtered members
  const visibleMembers = teamMembers.filter(m => {
    if (filter === 'active' && m.status === 'idle') return false;
    if (filter === 'idle' && m.status !== 'idle') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!m.username.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Task assignment handlers
  const selectedRegion = regions.find(r => r.id === taskRegionId);
  const selectedRegionLocations = selectedRegion?.locations ?? [];

  const openAssignTaskModal = (member: TeamMemberStatus) => {
    if (!currentUserId) return;
    setAssignError(null);
    setTaskMember(member);
    const defaultRegionId = regions?.[0]?.id ?? 0;
    setTaskRegionId(defaultRegionId);
    const defaultRegionName = regions?.find(r => r.id === defaultRegionId)?.name ?? '';
    setTaskTitle(defaultRegionName ? `${defaultRegionName} Görevi` : 'Görev');
    setTaskDescription('');
    const defaultLocs = regions?.find(r => r.id === defaultRegionId)?.locations ?? [];
    setSelectedTaskLocationIds(defaultLocs.map(l => String(l.id)));
    setIsAssignTaskModalOpen(true);
  };

  const closeAssignTaskModal = () => {
    setIsAssignTaskModalOpen(false);
    setTaskMember(null);
    setAssignError(null);
    setAssigningTask(false);
  };

  const handleAssignTask = async () => {
    if (!currentUserId || !taskMember) return;
    setAssignError(null);
    if (!taskRegionId || taskRegionId === 0) { setAssignError('Bölge seçiniz'); return; }
    const region = selectedRegion;
    const regionLocations = selectedRegionLocations;
    if (!region || regionLocations.length === 0) { setAssignError('Seçilen bölgede lokasyon bulunamadı'); return; }
    const selectedSet = new Set(selectedTaskLocationIds.map(String));
    const selectedLocations = regionLocations.filter(l => selectedSet.has(String(l.id)));
    if (selectedLocations.length === 0) { setAssignError('En az 1 lokasyon seçmelisiniz'); return; }
    const routeLocationIds = selectedLocations.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base', numeric: true })).map(l => l.id);
    if (routeLocationIds.length === 0) { setAssignError('Görev rotası boş olamaz'); return; }
    setAssigningTask(true);
    try {
      const result = await createTask({
        title: taskTitle?.trim() || `${region.name} Görevi`,
        description: taskDescription?.trim() || null,
        createdByUserId: currentUserId,
        createdByUsername: currentUsername ?? null,
        assignedToUserId: taskMember.user_id,
        assignedToUsername: taskMember.username,
        regionId: region.id,
        regionName: region.name,
        routeLocationIds
      });
      if (!result.success) { setAssignError(result.error || 'Görev atanamadı'); return; }
      fetchCurrentTasksForMembers(teamMembers);
      closeAssignTaskModal();
    } catch { setAssignError('Görev atanamadı'); } 
    finally { setAssigningTask(false); }
  };

  const openTaskDetails = (member: TeamMemberStatus) => {
    const task = memberCurrentTask[member.user_id] ?? null;
    if (!task) return;
    setTaskDetailsMember(member);
    setTaskDetailsTask(task);
    setIsTaskDetailsOpen(true);
  };

  const closeTaskDetails = () => {
    setIsTaskDetailsOpen(false);
    setTaskDetailsMember(null);
    setTaskDetailsTask(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50 overflow-hidden">
      <div ref={panelRef} className="w-full h-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm safe-area-top">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg sm:rounded-xl shadow-sm shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">Ekip Durumu</h1>
                <p className="text-[10px] sm:text-xs text-gray-500">{teamMembers.length} ekip üyesi</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={fetchTeamStatus}
                disabled={loading}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Stats Cards - 2x2 on mobile, 4 cols on larger */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">Toplam</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-gray-800">{teamMembers.length}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-emerald-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-emerald-600">Aktif</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-emerald-600">{activeMembers.length}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-blue-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-blue-600 truncate">Tamamlanan</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-blue-600">{totalTodayCompleted}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-purple-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Route className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-purple-600">Rotada</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-purple-600">{totalInRoute}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Search & Filter Bar */}
        <div className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Üye ara..."
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-white border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 placeholder-gray-400 text-xs sm:text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
              />
            </div>
            <div className="flex rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 self-start">
              {([
                { key: 'all', label: 'Tümü' },
                { key: 'active', label: 'Aktif' },
                { key: 'idle', label: 'Bekleyen' }
              ] as { key: FilterType; label: string }[]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors ${
                    filter === f.key 
                      ? 'bg-cyan-600 text-white' 
                      : 'bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Team List */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 bg-gray-50 overflow-x-hidden">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl mb-3 shadow-sm">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-500" />
              </div>
              <p className="text-red-600 font-medium text-sm sm:text-base">{error}</p>
              <button onClick={fetchTeamStatus} className="mt-3 sm:mt-4 px-4 py-2 bg-white text-gray-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-100 border border-gray-200 shadow-sm">
                Tekrar Dene
              </button>
            </div>
          ) : loading && teamMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
                <RefreshCw className="relative w-10 h-10 sm:w-12 sm:h-12 animate-spin text-cyan-600" />
              </div>
              <p className="text-gray-500 mt-4 text-sm sm:text-base">Ekip durumu yükleniyor...</p>
            </div>
          ) : visibleMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl mb-3 shadow-sm">
                <Users className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-500 text-center">
                {filter !== 'all' ? 'Bu filtrede üye yok' : 'Henüz ekip üyesi yok'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {visibleMembers.map((member) => {
                const config = statusConfig[member.status] || statusConfig.idle;
                const StatusIcon = config.icon;
                const isActive = member.status !== 'idle';
                const isExpanded = expandedMemberId === member.id;
                const currentTask = memberCurrentTask[member.user_id] ?? null;
                const completedLocations = member.completed_locations || [];
                const currentDuration = formatLiveDuration(member.current_leg_start_time);

                return (
                  <div 
                    key={member.id} 
                    className={`rounded-xl sm:rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md ${
                      isActive 
                        ? `bg-white ${config.borderColor}` 
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    {/* Member Card Header */}
                    <div 
                      className="p-2.5 sm:p-4 cursor-pointer"
                      onClick={() => setExpandedMemberId(isExpanded ? null : member.id)}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-sm ${
                            isActive ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' : 'bg-gray-400'
                          }`}>
                            {member.username.charAt(0).toUpperCase()}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-white ${config.dotColor} ${isActive ? 'animate-pulse' : ''}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <h3 className="font-semibold text-gray-800 truncate text-sm sm:text-base">{member.username}</h3>
                            {isActive && (
                              <span className={`px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide rounded-full shrink-0 ${config.bgColor} ${config.color}`}>
                                {config.label}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-gray-500">
                            <span className="flex items-center gap-0.5 sm:gap-1">
                              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              {formatTimeAgo(member.last_updated_at)}
                            </span>
                            {member.today_completed_count > 0 && (
                              <span className="flex items-center gap-0.5 sm:gap-1 text-emerald-600">
                                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                {member.today_completed_count} tamamlandı
                              </span>
                            )}
                            {member.total_route_count > 0 && (
                              <span className="flex items-center gap-0.5 sm:gap-1 text-purple-600">
                                <Route className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                {member.completed_count}/{member.total_route_count}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0 flex items-center gap-1 sm:gap-2">
                          {isActive && member.current_lat && member.current_lng && onFocusMember && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onFocusMember(member.id, member.username, member.current_lat!, member.current_lng!);
                                onClose();
                              }}
                              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors"
                              title="Haritada göster"
                            >
                              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
                          <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {/* Active Status Card */}
                      {isActive && member.current_location_name && (
                        <div className={`mt-2 sm:mt-3 p-2 sm:p-3 rounded-lg sm:rounded-xl ${config.bgColor} border ${config.borderColor}`}>
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <StatusIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${config.color}`} />
                            <span className={`text-[10px] sm:text-xs font-semibold uppercase ${config.color}`}>
                              {member.status === 'yolda' ? 'Yolda' : 'Çalışıyor'}
                            </span>
                            {currentDuration && (
                              <span className={`ml-auto text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold ${config.bgColor} ${config.color}`}>
                                <Timer className="w-2.5 h-2.5 sm:w-3 sm:h-3 inline mr-0.5 sm:mr-1" />{currentDuration}
                              </span>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm font-semibold text-gray-800 truncate">{member.current_location_name}</div>
                          {member.next_location_name && (
                            <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-500">
                              <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              <span className="truncate">Sonra: {member.next_location_name}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Progress Bar */}
                      {member.total_route_count > 0 && (
                        <div className="mt-2 sm:mt-3">
                          <div className="flex items-center justify-between text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                            <span className="text-gray-500">Rota İlerlemesi</span>
                            <span className="font-bold text-gray-800">{member.completed_count} / {member.total_route_count}</span>
                          </div>
                          <div className="h-1.5 sm:h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${(member.completed_count / member.total_route_count) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-2.5 sm:px-4 pb-2.5 sm:pb-4 border-t border-gray-100">
                        <div className="pt-2.5 sm:pt-4 space-y-2 sm:space-y-3">
                          
                          {/* Task Buttons */}
                          <div className="flex gap-1.5 sm:gap-2">
                            {currentTask ? (
                              <button
                                onClick={() => openTaskDetails(member)}
                                className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1.5 sm:gap-2 border border-emerald-200"
                              >
                                <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden xs:inline">Mevcut</span> Görevi Gör
                              </button>
                            ) : currentUserId && (
                              <button
                                onClick={() => openAssignTaskModal(member)}
                                className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-indigo-50 text-indigo-600 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold hover:bg-indigo-100 flex items-center justify-center gap-1.5 sm:gap-2 border border-indigo-200"
                              >
                                <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                Görev Ata
                              </button>
                            )}
                            {isActive && member.current_lat && member.current_lng && onFocusMember && (
                              <button
                                onClick={() => {
                                  onFocusMember(member.id, member.username, member.current_lat!, member.current_lng!);
                                  onClose();
                                }}
                                className="px-3 sm:px-4 py-2 sm:py-2.5 bg-cyan-50 text-cyan-600 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold hover:bg-cyan-100 flex items-center justify-center gap-1.5 sm:gap-2 border border-cyan-200"
                              >
                                <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Haritada</span> Takip
                              </button>
                            )}
                          </div>

                          {/* Route Start Time */}
                          {member.route_started_at && (
                            <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500 bg-gray-50 rounded-lg sm:rounded-xl p-2 sm:p-3">
                              <span className="flex items-center gap-1.5 sm:gap-2">
                                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="hidden xs:inline">Rota</span> Başlangıcı
                              </span>
                              <span className="text-gray-800 font-medium">
                                {formatTime(member.route_started_at)} • {formatLiveDuration(member.route_started_at)}
                              </span>
                            </div>
                          )}

                          {/* Completed Locations */}
                          {completedLocations.length > 0 && (
                            <div className="bg-gray-50 rounded-lg sm:rounded-xl overflow-hidden border border-gray-200">
                              <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-gray-200 flex items-center justify-between">
                                <span className="text-xs sm:text-sm font-medium text-gray-800 flex items-center gap-1.5 sm:gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                                  Tamamlanan Yerler
                                </span>
                                <span className="text-[10px] sm:text-xs text-gray-500">{completedLocations.length} yer</span>
                              </div>
                              <div className="max-h-36 sm:max-h-48 overflow-y-auto p-1.5 sm:p-2 space-y-1.5 sm:space-y-2">
                                {completedLocations.map((loc, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5 sm:gap-2 text-[10px] sm:text-xs bg-emerald-50 rounded-lg p-1.5 sm:p-2 border border-emerald-200">
                                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-gray-800 truncate">{loc.name}</div>
                                      <div className="text-gray-500 flex items-center gap-1.5 sm:gap-2 mt-0.5">
                                        <span className="flex items-center gap-0.5 sm:gap-1">
                                          <Car className="w-2.5 h-2.5 sm:w-3 sm:h-3" />{loc.travelDurationMinutes} dk
                                        </span>
                                        <span className="flex items-center gap-0.5 sm:gap-1">
                                          <Briefcase className="w-2.5 h-2.5 sm:w-3 sm:h-3" />{loc.workDurationMinutes} dk
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Idle State */}
                          {!isActive && member.total_route_count === 0 && (
                            <div className="bg-gray-50 rounded-lg sm:rounded-xl p-4 sm:p-6 text-center">
                              <Clock className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-1.5 sm:mb-2 text-gray-400" />
                              <div className="text-xs sm:text-sm text-gray-500">Aktif rota yok</div>
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

        {/* Footer */}
        <footer className="shrink-0 px-3 sm:px-4 py-2 sm:py-3 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded font-medium">{activeMembers.length} aktif</span>
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{idleMembers.length} beklemede</span>
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden xs:inline">Her 30 saniyede</span> güncellenir
            </span>
          </div>
        </footer>

        {/* Task Assignment Modal */}
        {isAssignTaskModalOpen && taskMember && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100000] p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-lg shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800">Görev Ata</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Kişi: <span className="text-gray-800 font-semibold truncate">{taskMember.username}</span></p>
                </div>
                <button onClick={closeAssignTaskModal} className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 shrink-0">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {assignError && (
                <div className="mb-3 sm:mb-4 text-xs sm:text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                  {assignError}
                </div>
              )}

              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Bölge</label>
                  <select
                    value={taskRegionId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setTaskRegionId(id);
                      const name = regions.find(r => r.id === id)?.name ?? '';
                      if (name) setTaskTitle(`${name} Görevi`);
                      const locs = regions.find(r => r.id === id)?.locations ?? [];
                      setSelectedTaskLocationIds(locs.map(l => String(l.id)));
                    }}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  >
                    <option value={0}>Bölge seçiniz</option>
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>{r.id}. Bölge - {r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Görev Başlığı</label>
                  <input
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Açıklama (opsiyonel)</label>
                  <textarea
                    value={taskDescription}
                    onChange={e => setTaskDescription(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 resize-none"
                  />
                </div>

                {taskRegionId !== 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <label className="text-xs sm:text-sm font-medium text-gray-700">
                        Lokasyonlar ({selectedTaskLocationIds.length}/{selectedRegionLocations.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedTaskLocationIds.length === selectedRegionLocations.length) {
                            setSelectedTaskLocationIds([]);
                          } else {
                            setSelectedTaskLocationIds(selectedRegionLocations.map(l => String(l.id)));
                          }
                        }}
                        className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                      >
                        {selectedTaskLocationIds.length === selectedRegionLocations.length ? 'Hiçbirini Seçme' : 'Tümünü Seç'}
                      </button>
                    </div>
                    <div className="max-h-32 sm:max-h-40 overflow-y-auto bg-gray-50 rounded-lg sm:rounded-xl border border-gray-200 p-1.5 sm:p-2 space-y-1">
                      {selectedRegionLocations.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr')).map(loc => {
                        const isSelected = selectedTaskLocationIds.includes(String(loc.id));
                        return (
                          <label key={loc.id} className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-md sm:rounded-lg cursor-pointer ${isSelected ? 'bg-cyan-50' : 'hover:bg-gray-100'}`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedTaskLocationIds(prev => prev.filter(id => id !== String(loc.id)));
                                } else {
                                  setSelectedTaskLocationIds(prev => [...prev, String(loc.id)]);
                                }
                              }}
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-gray-50 border-gray-300 text-cyan-500 focus:ring-cyan-500/50"
                            />
                            <span className={`text-xs sm:text-sm truncate ${isSelected ? 'text-gray-800' : 'text-gray-700'}`}>{loc.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleAssignTask}
                  disabled={assigningTask || taskRegionId === 0 || selectedTaskLocationIds.length === 0}
                  className="w-full py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-cyan-600 text-white font-semibold shadow-sm hover:bg-cyan-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-sm"
                >
                  {assigningTask ? (
                    <>
                      <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      Atanıyor...
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                      Görevi Ata
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Details Modal */}
        {isTaskDetailsOpen && taskDetailsMember && taskDetailsTask && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100000] p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-lg shadow-2xl border border-gray-200">
              <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 truncate">{taskDetailsTask.title}</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{taskDetailsMember.username}</p>
                </div>
                <button onClick={closeTaskDetails} className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 shrink-0">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                {taskDetailsTask.description && (
                  <p className="text-xs sm:text-sm text-gray-700 bg-gray-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">{taskDetailsTask.description}</p>
                )}
                
                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                  <div className="bg-gray-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                    <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Bölge</div>
                    <div className="text-gray-800 font-medium truncate">{taskDetailsTask.regionName || '-'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                    <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Lokasyon</div>
                    <div className="text-gray-800 font-medium">{taskDetailsTask.routeLocationIds?.length || 0} yer</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                    <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Durum</div>
                    <div className={`font-medium ${taskDetailsTask.status === 'in_progress' ? 'text-blue-600' : taskDetailsTask.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {taskDetailsTask.status === 'in_progress' ? 'Devam Ediyor' : taskDetailsTask.status === 'completed' ? 'Tamamlandı' : 'Atandı'}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
                    <div className="text-gray-500 text-[10px] sm:text-xs mb-0.5 sm:mb-1">Atayan</div>
                    <div className="text-gray-800 font-medium truncate">{taskDetailsTask.createdByUsername || '-'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamPanel;
