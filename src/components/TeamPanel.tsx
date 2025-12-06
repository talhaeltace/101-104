import React, { useState, useEffect, useRef } from 'react';
import { Users, MapPin, Navigation, CheckCircle2, Clock, X, RefreshCw, ChevronRight, Activity, Car, Briefcase, Timer, TrendingUp, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDuration as formatMinutes } from '../lib/teamStatus';

// Extended interface with detailed tracking fields
export interface TeamMemberStatus {
  id: string;
  user_id: string;
  username: string;
  status: 'idle' | 'yolda' | 'adreste' | 'tamamladi';
  current_location_id: number | null;
  current_location_name: string | null;
  next_location_name: string | null;
  total_route_count: number;
  completed_count: number;
  current_lat: number | null;
  current_lng: number | null;
  last_updated_at: string;
  route_started_at: string | null;
  // New detailed tracking fields
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
  onFocusMember?: (lat: number, lng: number) => void;
}

const statusLabels: Record<string, { label: string; color: string; bgColor: string; dotColor: string; icon: React.ReactNode }> = {
  idle: {
    label: 'Beklemede',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    dotColor: 'bg-gray-400',
    icon: <Clock className="w-4 h-4" />
  },
  yolda: {
    label: 'Yolda',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    dotColor: 'bg-blue-500',
    icon: <Navigation className="w-4 h-4" />
  },
  adreste: {
    label: 'Adreste',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    dotColor: 'bg-orange-500',
    icon: <MapPin className="w-4 h-4" />
  },
  tamamladi: {
    label: 'Tamamladı',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    dotColor: 'bg-green-500',
    icon: <CheckCircle2 className="w-4 h-4" />
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

const TeamPanel: React.FC<Props> = ({ isOpen, onClose, onFocusMember }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMemberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch team status
  const fetchTeamStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('team_status')
        .select('*')
        .order('status', { ascending: true })
        .order('last_updated_at', { ascending: false });
      
      if (fetchError) {
        console.error('Team status fetch error:', fetchError);
        setError('Ekip durumu yüklenemedi');
        return;
      }
      
      // Sort: active members first, then idle
      const sorted = (data || []).sort((a, b) => {
        if (a.status === 'idle' && b.status !== 'idle') return 1;
        if (a.status !== 'idle' && b.status === 'idle') return -1;
        return new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime();
      });
      
      setTeamMembers(sorted);
    } catch (err) {
      console.error('Team status error:', err);
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!isOpen) return;
    
    fetchTeamStatus();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('team_status_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_status'
        },
        () => {
          fetchTeamStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(() => {
      fetchTeamStatus();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeMembers = teamMembers.filter(m => m.status !== 'idle');
  const idleMembers = teamMembers.filter(m => m.status === 'idle');
  const totalTodayCompleted = teamMembers.reduce((sum, m) => sum + (m.today_completed_count || 0), 0);
  const totalTravelMins = teamMembers.reduce((sum, m) => sum + (m.total_travel_minutes || 0), 0);
  const totalWorkMins = teamMembers.reduce((sum, m) => sum + (m.total_work_minutes || 0), 0);
  const totalInRoute = teamMembers.reduce((sum, m) => sum + (m.total_route_count || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4">
      <div 
        ref={panelRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-white/20 rounded-xl">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg sm:text-xl">Saha Ekibi Takip</h2>
              <p className="text-xs sm:text-sm text-white/80">{teamMembers.length} ekip üyesi • Bugün</p>
            </div>
          </div>
          
          {/* Stats in header */}
          <div className="hidden sm:flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{activeMembers.length}</div>
              <div className="text-xs text-white/70">Aktif</div>
            </div>
            <div className="w-px h-10 bg-white/20"></div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totalTodayCompleted}</div>
              <div className="text-xs text-white/70">Tamamlanan</div>
            </div>
            <div className="w-px h-10 bg-white/20"></div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatMinutes(totalTravelMins)}</div>
              <div className="text-xs text-white/70">Yolda</div>
            </div>
            <div className="w-px h-10 bg-white/20"></div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatMinutes(totalWorkMins)}</div>
              <div className="text-xs text-white/70">Çalışma</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchTeamStatus}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm">
            <div className="p-1.5 bg-green-100 rounded-lg">
              <Activity className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Aktif</div>
              <div className="text-sm font-bold text-gray-800">{activeMembers.length} kişi</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Tamamlanan</div>
              <div className="text-sm font-bold text-gray-800">{totalTodayCompleted} yer</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm">
            <div className="p-1.5 bg-orange-100 rounded-lg">
              <Car className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Toplam Yol</div>
              <div className="text-sm font-bold text-gray-800">{formatMinutes(totalTravelMins)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm">
            <div className="p-1.5 bg-purple-100 rounded-lg">
              <Briefcase className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Toplam Çalışma</div>
              <div className="text-sm font-bold text-gray-800">{formatMinutes(totalWorkMins)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm col-span-2 sm:col-span-1">
            <div className="p-1.5 bg-indigo-100 rounded-lg">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Rotadaki</div>
              <div className="text-sm font-bold text-gray-800">{totalInRoute} yer</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {loading && teamMembers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">
              <p>{error}</p>
              <button
                onClick={fetchTeamStatus}
                className="mt-2 text-sm text-indigo-600 hover:underline"
              >
                Tekrar dene
              </button>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">Henüz ekip üyesi yok</p>
              <p className="text-sm text-gray-400 mt-1">Editör kullanıcıları giriş yaptığında burada görünecek</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Members Section */}
              {activeMembers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                      Aktif Üyeler ({activeMembers.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {activeMembers.map((member) => (
                      <TeamMemberCard 
                        key={member.id} 
                        member={member} 
                        onFocus={onFocusMember}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Idle Members Section */}
              {idleMembers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 bg-gray-400 rounded-full"></span>
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                      Bekleyen Üyeler ({idleMembers.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {idleMembers.map((member) => (
                      <TeamMemberCard 
                        key={member.id} 
                        member={member} 
                        onFocus={onFocusMember}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface TeamMemberCardProps {
  member: TeamMemberStatus;
  onFocus?: (lat: number, lng: number) => void;
}

const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ member, onFocus }) => {
  const [showCompletedList, setShowCompletedList] = useState(false);
  const statusInfo = statusLabels[member.status] || statusLabels.idle;
  const isActive = member.status !== 'idle';
  const completedLocations = member.completed_locations || [];
  
  const handleFocusClick = () => {
    if (onFocus && member.current_lat && member.current_lng) {
      onFocus(member.current_lat, member.current_lng);
    }
  };

  // Calculate current duration (if working or traveling)
  const getCurrentDuration = () => {
    if (member.status === 'adreste' && member.work_start_time) {
      return formatLiveDuration(member.work_start_time);
    }
    if (member.status === 'yolda' && member.current_leg_start_time) {
      return formatLiveDuration(member.current_leg_start_time);
    }
    return null;
  };

  const currentDuration = getCurrentDuration();

  return (
    <div className={`bg-white border-2 rounded-xl overflow-hidden transition-all hover:shadow-lg ${
      isActive ? 'border-indigo-200 shadow-md' : 'border-gray-100 shadow-sm'
    }`}>
      {/* Header Row */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
              isActive 
                ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                : 'bg-gradient-to-br from-gray-400 to-gray-500'
            }`}>
              {member.username.charAt(0).toUpperCase()}
              {/* Status dot with pulse animation for active */}
              <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${statusInfo.dotColor} ${isActive ? 'animate-pulse' : ''}`}></span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-base">{member.username}</div>
              <div className="text-xs text-gray-400">{formatTimeAgo(member.last_updated_at)}</div>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
            {statusInfo.icon}
            <span className="text-xs font-semibold">{statusInfo.label}</span>
          </div>
        </div>

        {/* Today's Stats Summary */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center bg-green-50 rounded-lg py-2">
            <div className="text-lg font-bold text-green-600">{member.today_completed_count || 0}</div>
            <div className="text-[10px] text-green-700 font-medium">Tamamlanan</div>
          </div>
          <div className="text-center bg-orange-50 rounded-lg py-2">
            <div className="text-lg font-bold text-orange-600">{formatMinutes(member.total_travel_minutes || 0)}</div>
            <div className="text-[10px] text-orange-700 font-medium">Yol Süresi</div>
          </div>
          <div className="text-center bg-purple-50 rounded-lg py-2">
            <div className="text-lg font-bold text-purple-600">{formatMinutes(member.total_work_minutes || 0)}</div>
            <div className="text-[10px] text-purple-700 font-medium">Çalışma</div>
          </div>
        </div>

        {/* Current Activity with Live Duration */}
        {member.status === 'yolda' && member.current_location_name && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Car className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">Yolda</span>
              {currentDuration && (
                <span className="ml-auto text-xs bg-blue-100 px-2 py-0.5 rounded-full font-bold">
                  <Timer className="w-3 h-3 inline mr-1" />{currentDuration}
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-800">{member.current_location_name}</div>
            {member.next_location_name && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <ChevronRight className="w-3 h-3" />
                Sonra: {member.next_location_name}
              </div>
            )}
          </div>
        )}

        {member.status === 'adreste' && member.current_location_name && (
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 text-orange-700 mb-1">
              <Briefcase className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">Çalışıyor</span>
              {currentDuration && (
                <span className="ml-auto text-xs bg-orange-100 px-2 py-0.5 rounded-full font-bold animate-pulse">
                  <Timer className="w-3 h-3 inline mr-1" />{currentDuration}
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-800">{member.current_location_name}</div>
            {member.next_location_name && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <ChevronRight className="w-3 h-3" />
                Sonra: {member.next_location_name}
              </div>
            )}
          </div>
        )}

        {/* Progress Bar for Active Route */}
        {member.total_route_count > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">Rota İlerlemesi</span>
              <span className="font-bold text-gray-700">
                {member.completed_count} / {member.total_route_count}
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
                style={{ width: `${(member.completed_count / member.total_route_count) * 100}%` }}
              />
            </div>
            {member.route_started_at && (
              <div className="text-xs text-gray-500 mt-1 text-right">
                Başlangıç: {formatTime(member.route_started_at)} • Geçen: {formatLiveDuration(member.route_started_at)}
              </div>
            )}
          </div>
        )}

        {/* Idle State */}
        {member.status === 'idle' && member.total_route_count === 0 && (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <div className="text-sm text-gray-500">Aktif rota yok</div>
            {member.today_completed_count > 0 && (
              <div className="text-xs text-green-600 mt-1">
                Bugün {member.today_completed_count} yer tamamladı
              </div>
            )}
          </div>
        )}
      </div>

      {/* Completed Locations Accordion */}
      {completedLocations.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowCompletedList(!showCompletedList)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-green-500" />
              <span>Tamamlanan Yerler ({completedLocations.length})</span>
            </span>
            {showCompletedList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showCompletedList && (
            <div className="px-4 pb-3 max-h-48 overflow-y-auto">
              <div className="space-y-2">
                {completedLocations.map((loc, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs bg-green-50 rounded-lg p-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{loc.name}</div>
                      <div className="text-gray-500 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Car className="w-3 h-3" />{loc.travelDurationMinutes} dk yol
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />{loc.workDurationMinutes} dk çalışma
                        </span>
                      </div>
                      <div className="text-gray-400 mt-0.5">
                        {formatTime(loc.arrivedAt)} - {formatTime(loc.completedAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Focus Button */}
      {member.current_lat && member.current_lng && onFocus && (
        <div className="px-4 pb-4">
          <button
            onClick={handleFocusClick}
            className="w-full py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center gap-2 border border-indigo-200"
          >
            <Navigation className="w-4 h-4" />
            Haritada Göster
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamPanel;
