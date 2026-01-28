import { useCallback, useEffect, useState } from 'react';
import { 
  ClipboardCheck, X, RefreshCw, CheckCircle2, XCircle, Clock, 
  MapPin, User, Calendar, AlertCircle, Search, FileCheck2,
  Inbox, Edit3, Trash2
} from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import {
  listPendingAcceptanceRequests,
  approveAcceptanceRequest,
  rejectAcceptanceRequest,
  type AcceptanceRequest
} from '../lib/acceptanceRequests';
import { logActivity } from '../lib/activityLogger';
import type { Location } from '../data/regions';
import LocationEditModal from './LocationEditModal';
import { apiFetch } from '../lib/apiClient';

interface Props {
  currentUserId: string;
  currentUsername?: string;
  onClose: () => void;
  onPendingCountChanged?: (count: number) => void;
}

export default function AdminAcceptanceRequestsFullscreen({
  currentUserId,
  currentUsername,
  onClose,
  onPendingCountChanged
}: Props) {
  useBodyScrollLock(true);

  const [pendingAcceptanceRequests, setPendingAcceptanceRequests] = useState<AcceptanceRequest[]>([]);
  const [acceptanceLoading, setAcceptanceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [acceptanceEditRequest, setAcceptanceEditRequest] = useState<AcceptanceRequest | null>(null);
  const [acceptanceEditLocation, setAcceptanceEditLocation] = useState<Location | null>(null);
  const [acceptanceEditOriginalLocation, setAcceptanceEditOriginalLocation] = useState<Location | null>(null);
  const [isAcceptanceEditOpen, setIsAcceptanceEditOpen] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

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

  const loadAcceptanceRequests = useCallback(async () => {
    try {
      setAcceptanceLoading(true);
      const list = await listPendingAcceptanceRequests();
      setPendingAcceptanceRequests(list);
      onPendingCountChanged?.(Array.isArray(list) ? list.length : 0);
    } catch (e) {
      console.warn('loadAcceptanceRequests failed', e);
      setPendingAcceptanceRequests([]);
      onPendingCountChanged?.(0);
    } finally {
      setAcceptanceLoading(false);
    }
  }, [onPendingCountChanged]);

  const mapLocationRowToLocation = (item: any): Location => ({
    id: String(item.id),
    name: String(item.name ?? ''),
    center: String(item.center ?? ''),
    coordinates: [Number(item.latitude ?? 0), Number(item.longitude ?? 0)],
    address: item.address ?? undefined,
    note: item.note ?? undefined,
    brand: String(item.brand ?? ''),
    model: String(item.model ?? ''),
    details: {
      tags: '',
      hasGPS: !!item.has_gps,
      hasRTU: !!item.has_rtu,
      hasPanos: !!item.has_panos,
      isAccepted: item.is_accepted ?? false,
      isInstalled: item.is_installed ?? false,
      hasCardAccess: item.has_card_access ?? false,
      isInstalledCardAccess: item.is_installed_card_access ?? false,
      isActiveCardAccess: item.is_active_card_access ?? false,
      isTwoDoorCardAccess: item.is_two_door_card_access ?? false,
      isActive: !!item.is_active,
      isConfigured: !!item.is_configured,
      equipment: {
        securityFirewall: item.security_firewall || 0,
        networkSwitch: item.network_switch || 0,
        rtuCount: item.rtu_count || 0,
        gpsCardAntenna: item.gps_card_antenna || 0,
        rtuPanel: item.rtu_panel || 0,
        btpPanel: item.btp_panel || 0,
        energyAnalyzer: item.energy_analyzer || 0,
        ykgcCount: item.ykgc_count || 0,
        teiasRtuInstallation: item.teias_rtu_installation || 0,
        indoorDomeCamera: item.indoor_dome_camera || 0,
        networkVideoManagement: item.network_video_management || 0,
        smartControlUnit: item.smart_control_unit || 0,
        cardReader: item.card_reader || 0,
        networkRecordingUnit: item.network_recording_unit || 0,
        accessControlSystem: item.access_control_system || 0,
        transformerCenterType: String(item.transformer_center_type || '')
      }
    }
  });

  const fetchLocationById = async (locationId: string): Promise<Location | null> => {
    try {
      const res = await apiFetch(`/locations/${encodeURIComponent(String(locationId))}`);
      const data = (res as any)?.data;
      if (!data) return null;
      return mapLocationRowToLocation(data);
    } catch (e) {
      console.warn('fetchLocationById exception', e);
      return null;
    }
  };

  const updateLocationFromAdmin = async (updatedLocation: Location): Promise<boolean> => {
    try {
      await apiFetch(`/locations/${encodeURIComponent(String(updatedLocation.id))}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: updatedLocation.name,
            center: updatedLocation.center,
            latitude: updatedLocation.coordinates[0],
            longitude: updatedLocation.coordinates[1],
            address: updatedLocation.address || null,
            note: updatedLocation.note || null,
            brand: updatedLocation.brand,
            model: updatedLocation.model,
            has_gps: updatedLocation.details.hasGPS,
            has_rtu: updatedLocation.details.hasRTU,
            has_panos: updatedLocation.details.hasPanos,
            is_accepted: updatedLocation.details.isAccepted || false,
            has_card_access: updatedLocation.details.hasCardAccess || false,
            is_installed_card_access: updatedLocation.details.isInstalledCardAccess || false,
            is_active_card_access: updatedLocation.details.isActiveCardAccess || false,
            is_two_door_card_access: updatedLocation.details.isTwoDoorCardAccess || false,
            is_active: updatedLocation.details.isActive,
            is_configured: updatedLocation.details.isConfigured,
            is_installed: updatedLocation.details.isInstalled || false,
            security_firewall: updatedLocation.details.equipment.securityFirewall,
            network_switch: updatedLocation.details.equipment.networkSwitch,
            rtu_count: updatedLocation.details.equipment.rtuCount,
            gps_card_antenna: updatedLocation.details.equipment.gpsCardAntenna,
            rtu_panel: updatedLocation.details.equipment.rtuPanel,
            btp_panel: updatedLocation.details.equipment.btpPanel,
            energy_analyzer: updatedLocation.details.equipment.energyAnalyzer,
            ykgc_count: updatedLocation.details.equipment.ykgcCount,
            teias_rtu_installation: updatedLocation.details.equipment.teiasRtuInstallation,
            indoor_dome_camera: updatedLocation.details.equipment.indoorDomeCamera,
            network_video_management: updatedLocation.details.equipment.networkVideoManagement,
            smart_control_unit: updatedLocation.details.equipment.smartControlUnit,
            card_reader: updatedLocation.details.equipment.cardReader,
            network_recording_unit: updatedLocation.details.equipment.networkRecordingUnit,
            access_control_system: updatedLocation.details.equipment.accessControlSystem,
            transformer_center_type: updatedLocation.details.equipment.transformerCenterType || null,
            updated_at: new Date().toISOString(),
          }),
        }
      );
      return true;
    } catch (e) {
      console.warn('updateLocationFromAdmin exception', e);
      setError('Lokasyon kaydedilirken hata oluştu');
      return false;
    }
  };

  const describeAcceptanceChanges = (before: Location, after: Location) => {
    const changes: string[] = [];
    const addBool = (label: string, beforeVal: unknown, afterVal: unknown) => {
      const b = Boolean(beforeVal);
      const a = Boolean(afterVal);
      if (b !== a) changes.push(`${label}: ${b ? 'Evet' : 'Hayır'} → ${a ? 'Evet' : 'Hayır'}`);
    };
    addBool('Kabulü Yapıldı', before.details?.isAccepted, after.details?.isAccepted);
    addBool('Kartlı Geçiş (KG)', before.details?.hasCardAccess, after.details?.hasCardAccess);
    addBool('2 Kapılı (KG)', before.details?.isTwoDoorCardAccess, after.details?.isTwoDoorCardAccess);
    const beforeDetails: any = (before as any).details ?? {};
    const afterDetails: any = (after as any).details ?? {};
    addBool('Bina Kilitli', beforeDetails.isBuildingLocked, afterDetails.isBuildingLocked);
    addBool('Şalter Kapalı', beforeDetails.isSwitchOff, afterDetails.isSwitchOff);
    addBool('Kapı Kilitli', beforeDetails.isDoorLocked, afterDetails.isDoorLocked);
    addBool('Elektrik Yok', beforeDetails.hasNoPower, afterDetails.hasNoPower);
    return changes;
  };

  const openAcceptanceEdit = async (req: AcceptanceRequest) => {
    setAcceptanceEditRequest(req);
    setAcceptanceEditLocation(null);
    setAcceptanceEditOriginalLocation(null);
    setIsAcceptanceEditOpen(true);
    setProcessingId(req.id);

    const loc = await fetchLocationById(req.locationId);
    setProcessingId(null);
    if (!loc) {
      setError('Lokasyon bulunamadı');
      setIsAcceptanceEditOpen(false);
      setAcceptanceEditRequest(null);
      return;
    }

    setAcceptanceEditLocation(loc);
    setAcceptanceEditOriginalLocation(JSON.parse(JSON.stringify(loc)) as Location);
  };

  const closeAcceptanceEdit = () => {
    setIsAcceptanceEditOpen(false);
    setAcceptanceEditRequest(null);
    setAcceptanceEditLocation(null);
    setAcceptanceEditOriginalLocation(null);
  };

  const saveAcceptanceEditAndApprove = async (updatedLocation: Location) => {
    if (!acceptanceEditRequest || !acceptanceEditLocation) return;

    if (String(updatedLocation.id) !== String(acceptanceEditRequest.locationId)) {
      console.error('Approval attempted with mismatched location id');
      return;
    }

    const before = acceptanceEditOriginalLocation ?? acceptanceEditLocation;
    const changes = describeAcceptanceChanges(before, updatedLocation);

    const saved = await updateLocationFromAdmin(updatedLocation);
    if (!saved) return;

    const success = await approveAcceptanceRequest({
      requestId: acceptanceEditRequest.id,
      adminUserId: currentUserId,
      adminUsername: currentUsername
    });

    if (!success) {
      setError('Onay işlemi başarısız');
      return;
    }

    try {
      const requestedBy = acceptanceEditRequest.requestedByUsername || acceptanceEditRequest.requestedByUserId || 'Bilinmiyor';
      const approvedBy = currentUsername || currentUserId || 'Admin';
      const changeText = changes.length ? changes.join(' • ') : 'Değişiklik yok';
      await logActivity({
        username: approvedBy,
        action: `Kabul onayı: ${updatedLocation.name} | Talep eden: ${requestedBy} | Onaylayan: ${approvedBy} | Değişenler: ${changeText}`,
        location_id: String(updatedLocation.id),
        location_name: updatedLocation.name,
        activity_type: 'general'
      });
    } catch (e) {
      console.warn('Failed to log approval activity', e);
    }

    setSuccessMessage('Kaydedildi ve onaylandı');
    closeAcceptanceEdit();
    await loadAcceptanceRequests();
  };

  const handleReject = async (req: AcceptanceRequest) => {
    const ok = confirm(`"${req.locationName}" için isteği reddetmek istiyor musunuz?`);
    if (!ok) return;

    setProcessingId(req.id);
    const success = await rejectAcceptanceRequest({
      requestId: req.id,
      adminUserId: currentUserId,
      adminUsername: currentUsername
    });
    setProcessingId(null);

    if (!success) {
      setError('Reddetme işlemi başarısız');
      return;
    }
    setSuccessMessage('Reddedildi');
    await loadAcceptanceRequests();
  };

  useEffect(() => {
    loadAcceptanceRequests();
    const id = window.setInterval(() => loadAcceptanceRequests(), 10_000);
    return () => window.clearInterval(id);
  }, [loadAcceptanceRequests]);

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

  const filteredRequests = pendingAcceptanceRequests.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.locationName.toLowerCase().includes(q) || 
           r.requestedByUsername?.toLowerCase().includes(q) ||
           r.locationId.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50">
      <div className="w-full h-full flex flex-col">

        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 rounded-xl">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Kabul Onayları</h1>
                <p className="text-xs text-gray-500">{pendingAcceptanceRequests.length} bekleyen onay</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={loadAcceptanceRequests}
                disabled={acceptanceLoading}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${acceptanceLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="px-4 pb-4 bg-gray-50">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-[10px] uppercase tracking-wide text-amber-600">Bekleyen</span>
                </div>
                <div className="text-2xl font-bold text-amber-700">{pendingAcceptanceRequests.length}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-[10px] uppercase tracking-wide text-green-600">Onayla</span>
                </div>
                <div className="text-sm text-green-600">Düzenle ve onayla</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-[10px] uppercase tracking-wide text-red-600">Reddet</span>
                </div>
                <div className="text-sm text-red-600">İsteği reddet</div>
              </div>
            </div>
          </div>
        </header>

        {/* Search Bar */}
        <div className="shrink-0 px-4 py-3 bg-white border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Lokasyon veya kullanıcı ara..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
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
          {acceptanceLoading && pendingAcceptanceRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-10 h-10 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-500">Onay istekleri yükleniyor...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-gray-100 rounded-2xl mb-4">
                <Inbox className="w-12 h-12 text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-600">
                {searchQuery ? 'Arama sonucu bulunamadı' : 'Bekleyen onay yok'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery ? 'Farklı bir arama deneyin' : 'Tüm istekler işlenmiş'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((r) => {
                const isProcessing = processingId === r.id;
                
                return (
                  <div 
                    key={r.id} 
                    className={`bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition-all ${
                      isProcessing ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                          <MapPin className="w-6 h-6 text-blue-600" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <h3 className="font-semibold text-gray-800 truncate">{r.locationName}</h3>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                <span className="px-2 py-0.5 bg-gray-100 rounded-lg">ID: {r.locationId}</span>
                              </div>
                            </div>
                            <span className="shrink-0 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-semibold flex items-center gap-1 border border-amber-200">
                              <Clock className="w-3 h-3" />
                              Bekliyor
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className="flex items-center gap-2 text-sm">
                              <User className="w-4 h-4 text-gray-400" />
                              <div>
                                <div className="text-[10px] uppercase text-gray-500">İsteyen</div>
                                <div className="text-gray-800 font-medium">{r.requestedByUsername || '-'}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <div>
                                <div className="text-[10px] uppercase text-gray-500">Tarih</div>
                                <div className="text-gray-600">{formatTimeAgo(r.createdAt)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => openAcceptanceEdit(r)}
                          disabled={isProcessing}
                          className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                          {isProcessing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Edit3 className="w-4 h-4" />
                              Düzenle & Onayla
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleReject(r)}
                          disabled={isProcessing}
                          className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2 border border-red-200"
                        >
                          <Trash2 className="w-4 h-4" />
                          Reddet
                        </button>
                      </div>
                    </div>
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
              <FileCheck2 className="w-4 h-4" />
              {pendingAcceptanceRequests.length} bekleyen onay
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Her 10 saniyede güncellenir
            </span>
          </div>
        </footer>

        {/* Location Edit Modal */}
        {acceptanceEditRequest && acceptanceEditLocation && (
          <LocationEditModal
            location={acceptanceEditLocation}
            isOpen={isAcceptanceEditOpen}
            isAdmin={true}
            isEditor={false}
            saveLabel="Onayla ve Kaydet"
            onClose={closeAcceptanceEdit}
            onSave={saveAcceptanceEditAndApprove}
          />
        )}
      </div>
    </div>
  );
}
