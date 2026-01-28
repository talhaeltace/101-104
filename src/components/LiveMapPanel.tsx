import { useEffect, useState, useCallback, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  X,
  Users,
  MapPin,
  Navigation,
  Clock,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Target,
  Route,
  Zap,
  Coffee,
  Car,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

interface TeamMember {
  id: string;
  username: string;
  fullName?: string;
  status: 'idle' | 'yolda' | 'adreste' | 'tamamladi';
  currentLat?: number;
  currentLng?: number;
  currentLocationName?: string;
  nextLocationName?: string;
  totalRouteCount?: number;
  completedCount?: number;
  activeRoute?: any[];
  currentRouteIndex?: number;
  isWorking?: boolean;
  workStartTime?: string;
  lastUpdated?: string;
}

interface LiveMapPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Circle }> = {
  idle: { label: 'Boşta', color: 'text-slate-400', bg: 'bg-slate-500/20', icon: Coffee },
  yolda: { label: 'Yolda', color: 'text-blue-400', bg: 'bg-blue-500/20', icon: Car },
  adreste: { label: 'Adreste', color: 'text-amber-400', bg: 'bg-amber-500/20', icon: Zap },
  tamamladi: { label: 'Tamamladı', color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: CheckCircle2 },
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} saat önce`;
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function formatDuration(startTime?: string): string {
  if (!startTime) return '';
  try {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    
    if (hours > 0) return `${hours}s ${remainMins}dk`;
    return `${mins} dk`;
  } catch {
    return '';
  }
}

export default function LiveMapPanel({ isOpen, onClose }: LiveMapPanelProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('map');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routeLayerRef = useRef<any>(null);
  const targetMarkerRef = useRef<any>(null);

  const selectedMember = members.find(m => m.id === selectedMemberId) ?? null;

  const loadMembers = useCallback(async () => {
    try {
      const res = await apiFetch('/team-status');
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      
      const mapped: TeamMember[] = rows.map((r: any) => ({
        id: String(r.user_id),
        username: String(r.username ?? ''),
        fullName: r.full_name ? String(r.full_name) : undefined,
        status: r.status || 'idle',
        currentLat: r.current_lat != null ? Number(r.current_lat) : undefined,
        currentLng: r.current_lng != null ? Number(r.current_lng) : undefined,
        currentLocationName: r.current_location_name || undefined,
        nextLocationName: r.next_location_name || undefined,
        totalRouteCount: r.total_route_count ?? 0,
        completedCount: r.completed_count ?? 0,
        activeRoute: r.active_route ? (typeof r.active_route === 'string' ? JSON.parse(r.active_route) : r.active_route) : [],
        currentRouteIndex: r.current_route_index ?? 0,
        isWorking: r.is_working ?? false,
        workStartTime: r.work_start_time || undefined,
        lastUpdated: r.updated_at || undefined,
      }));
      
      setMembers(mapped.sort((a, b) => {
        // Sort by status priority: adreste > yolda > tamamladi > idle
        const priority: Record<string, number> = { adreste: 0, yolda: 1, tamamladi: 2, idle: 3 };
        return (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
      }));
    } catch {
      // ignore
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    loadMembers().finally(() => setLoading(false));
    
    const id = window.setInterval(loadMembers, 3000);
    return () => window.clearInterval(id);
  }, [isOpen, loadMembers]);

  // Helper to cleanup map instance
  const cleanupMap = useCallback(() => {
    // Clear markers
    markersRef.current.forEach(marker => {
      try { marker.remove(); } catch { /* ignore */ }
    });
    markersRef.current.clear();
    
    // Clear route layer
    if (routeLayerRef.current) {
      try { routeLayerRef.current.remove(); } catch { /* ignore */ }
      routeLayerRef.current = null;
    }
    
    // Clear target marker
    if (targetMarkerRef.current) {
      try { targetMarkerRef.current.remove(); } catch { /* ignore */ }
      targetMarkerRef.current = null;
    }
    
    // Remove map instance
    if (mapInstanceRef.current) {
      try { 
        mapInstanceRef.current.remove(); 
      } catch { 
        /* ignore */ 
      }
      mapInstanceRef.current = null;
    }
    
    // Clear _leaflet_id from container
    if (mapContainerRef.current) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }
  }, []);

  // Initialize map when panel opens
  useEffect(() => {
    if (!isOpen) {
      // Panel closing - cleanup
      cleanupMap();
      return;
    }
    
    // Panel is opening
    if (!mapContainerRef.current) return;
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(async () => {
      if (!mapContainerRef.current) return;
      
      // Clean up any stale map first
      cleanupMap();
      
      const L = await import('leaflet');
      leafletRef.current = L;

      // Final check before creating map
      if (!mapContainerRef.current || (mapContainerRef.current as any)._leaflet_id) {
        return;
      }

      const map = L.map(mapContainerRef.current, {
        center: [39.0, 35.0],
        zoom: 6,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;

      // Invalidate size multiple times to ensure proper sizing on mobile
      const invalidate = () => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      };
      setTimeout(invalidate, 100);
      setTimeout(invalidate, 300);
      setTimeout(invalidate, 500);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isOpen, cleanupMap]);

  // Invalidate map size when mobile view changes
  useEffect(() => {
    if (mobileView === 'map' && mapInstanceRef.current) {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
    }
  }, [mobileView]);

  // Update markers on map
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapInstanceRef.current;

    // Track which IDs are still present
    const currentIds = new Set<string>();

    members.forEach(m => {
      if (m.currentLat == null || m.currentLng == null) return;
      currentIds.add(m.id);

      const isSelected = m.id === selectedMemberId;
      
      const existing = markersRef.current.get(m.id);
      const pos: [number, number] = [m.currentLat, m.currentLng];

      const iconHtml = `
        <div style="
          position: relative;
          width: ${isSelected ? '36px' : '28px'};
          height: ${isSelected ? '36px' : '28px'};
          border-radius: 9999px;
          background: ${isSelected ? '#3b82f6' : m.status === 'yolda' ? '#3b82f6' : m.status === 'adreste' ? '#f59e0b' : m.status === 'tamamladi' ? '#22c55e' : '#64748b'};
          border: 3px solid #fff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 700;
          font-size: ${isSelected ? '14px' : '11px'};
          transition: all 0.2s;
          ${isSelected ? 'z-index: 1000;' : ''}
        ">
          ${(m.fullName || m.username || 'U').charAt(0).toUpperCase()}
        </div>
        ${isSelected ? `<div style="
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          background: #3b82f6;
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        ">${m.username}</div>` : ''}
      `;

      if (!existing) {
        const icon = L.divIcon({
          className: 'live-map-marker',
          html: iconHtml,
          iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
          iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
        });
        const marker = L.marker(pos, { icon, zIndexOffset: isSelected ? 1000 : 0 });
        marker.on('click', () => {
          setSelectedMemberId(m.id);
          setMobileView('map');
        });
        marker.addTo(map);
        markersRef.current.set(m.id, marker);
      } else {
        existing.setLatLng(pos);
        // Update icon if selection changed
        const icon = L.divIcon({
          className: 'live-map-marker',
          html: iconHtml,
          iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
          iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
        });
        existing.setIcon(icon);
        existing.setZIndexOffset(isSelected ? 1000 : 0);
      }
    });

    // Remove old markers
    for (const [id, marker] of markersRef.current.entries()) {
      if (!currentIds.has(id)) {
        try { marker.remove(); } catch { /* ignore */ }
        markersRef.current.delete(id);
      }
    }
  }, [members, selectedMemberId]);

  // Draw route for selected member
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapInstanceRef.current;

    // Clear previous route
    if (routeLayerRef.current) {
      try { map.removeLayer(routeLayerRef.current); } catch { /* ignore */ }
      routeLayerRef.current = null;
    }
    if (targetMarkerRef.current) {
      try { map.removeLayer(targetMarkerRef.current); } catch { /* ignore */ }
      targetMarkerRef.current = null;
    }

    if (!selectedMember) return;
    if (!selectedMember.activeRoute || selectedMember.activeRoute.length === 0) return;

    const route = selectedMember.activeRoute;
    const currentIdx = selectedMember.currentRouteIndex ?? 0;

    // Build route points
    const routePoints: [number, number][] = [];
    
    // Add user's current location as start if available
    if (selectedMember.currentLat != null && selectedMember.currentLng != null) {
      routePoints.push([selectedMember.currentLat, selectedMember.currentLng]);
    }

    // Add remaining route locations
    for (let i = currentIdx; i < route.length; i++) {
      const loc = route[i];
      if (loc?.coordinates && Array.isArray(loc.coordinates)) {
        routePoints.push([loc.coordinates[0], loc.coordinates[1]]);
      }
    }

    if (routePoints.length >= 2) {
      // Draw route line
      const polyline = L.polyline(routePoints, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
      }).addTo(map);
      routeLayerRef.current = polyline;

      // Add target marker for current destination
      const currentTarget = route[currentIdx];
      if (currentTarget?.coordinates) {
        const targetIcon = L.divIcon({
          className: 'target-marker',
          html: `
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 8px;
              background: #ef4444;
              border: 3px solid #fff;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="6"/>
                <circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const targetMarker = L.marker([currentTarget.coordinates[0], currentTarget.coordinates[1]], { icon: targetIcon }).addTo(map);
        targetMarkerRef.current = targetMarker;
      }

      // Fit map to show route
      map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    } else if (selectedMember.currentLat != null && selectedMember.currentLng != null) {
      // Just center on user
      map.setView([selectedMember.currentLat, selectedMember.currentLng], 14);
    }
  }, [selectedMember]);

  const handleSelectMember = (id: string) => {
    setSelectedMemberId(prev => prev === id ? null : id);
    if (window.innerWidth < 1024) {
      setMobileView('map');
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await loadMembers();
    setLoading(false);
  };

  if (!isOpen) return null;

  const activeMembers = members.filter(m => m.status !== 'idle');
  const idleMembers = members.filter(m => m.status === 'idle');

  return (
    <div className="fixed inset-0 z-[1300] bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Header */}
        <div className="h-14 sm:h-16 px-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile back button */}
            {mobileView === 'map' && (
              <button
                onClick={() => setMobileView('list')}
                className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold text-white truncate flex items-center gap-2">
                Canlı Harita
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                  {activeMembers.length} aktif
                </span>
              </div>
              <div className="text-xs text-slate-400 truncate">
                {selectedMember ? selectedMember.fullName || selectedMember.username : 'Ekip takibi'}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={`p-2.5 rounded-xl transition-colors ${
                loading ? 'text-slate-600' : 'hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="absolute inset-x-0 top-14 sm:top-16 bottom-0 overflow-hidden">
          <div className="w-full h-full flex">
            {/* Sidebar - Members List */}
            <div className={`
              ${mobileView === 'map' ? 'hidden lg:flex' : 'flex'} 
              ${sidebarCollapsed ? 'w-0 lg:w-14' : 'w-full lg:w-80'} 
              flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300 overflow-hidden
            `}>
              {/* Sidebar Header */}
              <div className="shrink-0 p-3 border-b border-slate-800 flex items-center justify-between">
                <div className={`flex items-center gap-2 ${sidebarCollapsed ? 'hidden' : ''}`}>
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-semibold text-white">Ekip Üyeleri</span>
                  <span className="text-xs text-slate-500">({members.length})</span>
                </div>
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="hidden lg:flex p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              </div>

              {/* Members List */}
              <div className={`flex-1 overflow-auto ${sidebarCollapsed ? 'hidden' : ''}`}>
                {loading && members.length === 0 ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {/* Active Members */}
                    {activeMembers.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          Aktif ({activeMembers.length})
                        </div>
                        {activeMembers.map(m => (
                          <MemberCard
                            key={m.id}
                            member={m}
                            isSelected={m.id === selectedMemberId}
                            onClick={() => handleSelectMember(m.id)}
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Idle Members */}
                    {idleMembers.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          Boşta ({idleMembers.length})
                        </div>
                        {idleMembers.map(m => (
                          <MemberCard
                            key={m.id}
                            member={m}
                            isSelected={m.id === selectedMemberId}
                            onClick={() => handleSelectMember(m.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Map Area */}
            <div className={`${mobileView === 'list' ? 'hidden lg:block' : 'block'} flex-1 bg-slate-950 relative overflow-hidden`}>
              {/* Map Container */}
              <div 
                ref={mapContainerRef} 
                className="absolute top-0 left-0 right-0 bottom-0 z-0" 
                style={{ width: '100%', height: '100%' }} 
              />

              {/* Selected Member Info Card */}
              {selectedMember && (
                <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                          {(selectedMember.fullName || selectedMember.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {selectedMember.fullName || selectedMember.username}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {(() => {
                              const cfg = statusConfig[selectedMember.status] || statusConfig.idle;
                              const Icon = cfg.icon;
                              return (
                                <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                                  <Icon className="w-3 h-3" />
                                  {cfg.label}
                                </span>
                              );
                            })()}
                            {selectedMember.lastUpdated && (
                              <span className="text-[10px] text-slate-500">
                                • {formatRelativeTime(selectedMember.lastUpdated)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedMemberId(null)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Route Progress */}
                    {selectedMember.activeRoute && selectedMember.activeRoute.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Route className="w-3 h-3" />
                            Rota İlerlemesi
                          </span>
                          <span className="text-xs font-semibold text-white">
                            {selectedMember.completedCount ?? 0} / {selectedMember.totalRouteCount ?? selectedMember.activeRoute.length}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ 
                              width: `${((selectedMember.completedCount ?? 0) / Math.max(selectedMember.totalRouteCount ?? selectedMember.activeRoute.length, 1)) * 100}%` 
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Current Target */}
                    {selectedMember.status !== 'idle' && (
                      <div className="space-y-2">
                        {selectedMember.currentLocationName && (
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/60">
                            <Target className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Mevcut Hedef</div>
                              <div className="text-sm text-white font-medium truncate">{selectedMember.currentLocationName}</div>
                            </div>
                          </div>
                        )}
                        
                        {selectedMember.nextLocationName && (
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/60">
                            <MapPin className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Sonraki Durak</div>
                              <div className="text-sm text-white font-medium truncate">{selectedMember.nextLocationName}</div>
                            </div>
                          </div>
                        )}

                        {selectedMember.isWorking && selectedMember.workStartTime && (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <Clock className="w-4 h-4 text-amber-400" />
                            <div className="min-w-0">
                              <span className="text-xs text-amber-400 font-medium">
                                Çalışma süresi: {formatDuration(selectedMember.workStartTime)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedMember.status === 'idle' && (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        Aktif rota yok
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile: Show list button when no member selected */}
              {!selectedMember && mobileView === 'map' && (
                <button
                  onClick={() => setMobileView('list')}
                  className="lg:hidden absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium border border-slate-700 shadow-lg flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  Ekip Listesi
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Member Card Component
function MemberCard({ 
  member, 
  isSelected, 
  onClick 
}: { 
  member: TeamMember; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  const cfg = statusConfig[member.status] || statusConfig.idle;
  const Icon = cfg.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl transition-all mb-1 ${
        isSelected 
          ? 'bg-blue-600/20 border border-blue-500/30' 
          : 'hover:bg-slate-800/60 border border-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar with status indicator */}
        <div className="relative shrink-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
            member.status === 'yolda' ? 'bg-blue-600' :
            member.status === 'adreste' ? 'bg-amber-500' :
            member.status === 'tamamladi' ? 'bg-emerald-600' :
            'bg-slate-600'
          }`}>
            {(member.fullName || member.username || 'U').charAt(0).toUpperCase()}
          </div>
          {/* Online indicator */}
          {member.currentLat != null && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white truncate">
              {member.fullName || member.username}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>
          
          {member.status !== 'idle' && member.activeRoute && member.activeRoute.length > 0 && (
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <Route className="w-3 h-3" />
              <span>{member.completedCount ?? 0}/{member.totalRouteCount ?? member.activeRoute.length} tamamlandı</span>
            </div>
          )}

          {member.currentLocationName && member.status !== 'idle' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{member.currentLocationName}</span>
            </div>
          )}

          {member.lastUpdated && (
            <div className="mt-1 text-[10px] text-slate-600">
              {formatRelativeTime(member.lastUpdated)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
