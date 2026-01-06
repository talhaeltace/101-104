import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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

  const [acceptanceEditRequest, setAcceptanceEditRequest] = useState<AcceptanceRequest | null>(null);
  const [acceptanceEditLocation, setAcceptanceEditLocation] = useState<Location | null>(null);
  const [acceptanceEditOriginalLocation, setAcceptanceEditOriginalLocation] = useState<Location | null>(null);
  const [isAcceptanceEditOpen, setIsAcceptanceEditOpen] = useState(false);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  const loadAcceptanceRequests = async () => {
    try {
      setAcceptanceLoading(true);
      const list = await listPendingAcceptanceRequests();
      setPendingAcceptanceRequests(list);
      onPendingCountChanged?.(Array.isArray(list) ? list.length : 0);
      if (import.meta.env.DEV) {
        console.debug('[acceptance fullscreen] loaded pending list', { count: Array.isArray(list) ? list.length : 0 });
      }
    } catch (e) {
      console.warn('loadAcceptanceRequests failed', e);
      setPendingAcceptanceRequests([]);
      onPendingCountChanged?.(0);
    } finally {
      setAcceptanceLoading(false);
    }
  };

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
      const { data, error: fetchError } = await supabase
        .from('locations')
        .select('*')
        .eq('id', String(locationId))
        .maybeSingle();

      if (fetchError || !data) {
        console.warn('fetchLocationById error', fetchError);
        return null;
      }

      return mapLocationRowToLocation(data);
    } catch (e) {
      console.warn('fetchLocationById exception', e);
      return null;
    }
  };

  const updateLocationFromAdmin = async (updatedLocation: Location): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('locations')
        .update({
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
          updated_at: new Date().toISOString()
        })
        .eq('id', updatedLocation.id);

      if (updateError) {
        console.warn('updateLocationFromAdmin error', updateError);
        setError('Lokasyon kaydedilirken hata oluştu');
        return false;
      }

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

    const loc = await fetchLocationById(req.locationId);
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

    const acceptedLocation: Location = {
      ...updatedLocation,
      details: {
        ...updatedLocation.details,
        isAccepted: true
      }
    };

    const before = acceptanceEditOriginalLocation ?? acceptanceEditLocation;
    const changes = describeAcceptanceChanges(before, acceptedLocation);

    const saved = await updateLocationFromAdmin(acceptedLocation);
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
        action: `Kabul onayı: ${acceptedLocation.name} | Talep eden: ${requestedBy} | Onaylayan: ${approvedBy} | Değişenler: ${changeText}`,
        location_id: String(acceptedLocation.id),
        location_name: acceptedLocation.name,
        activity_type: 'general'
      });
    } catch (e) {
      console.warn('Failed to log approval activity', e);
    }

    setSuccessMessage('Kaydedildi ve onaylandı');
    closeAcceptanceEdit();
    await loadAcceptanceRequests();
  };

  useEffect(() => {
    loadAcceptanceRequests();

    const channel = supabase
      .channel('location_acceptance_requests_admin_fullscreen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_acceptance_requests' }, () => {
        loadAcceptanceRequests();
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="fixed inset-0 z-[1400] bg-white">
      <div className="h-14 border-b border-gray-100 bg-white/90 backdrop-blur-md flex items-center justify-between px-4">
        <div className="text-sm font-semibold text-gray-900">Kabul Onayları</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAcceptanceRequests}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {acceptanceLoading ? 'Yükleniyor…' : 'Yenile'}
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
      {successMessage && (
        <div className="m-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg">{successMessage}</div>
      )}

      <div className="h-[calc(100vh-3.5rem)] overflow-auto bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800">Onay bekleyen kayıtlar</div>
                <div className="text-xs text-gray-500">({pendingAcceptanceRequests.length})</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-white">
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Lokasyon</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">İsteyen</th>
                    <th className="p-3 text-left text-sm font-semibold text-gray-600">Tarih</th>
                    <th className="p-3 text-center text-sm font-semibold text-gray-600">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingAcceptanceRequests.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-gray-500">
                        Onay bekleyen kayıt yok
                      </td>
                    </tr>
                  ) : (
                    pendingAcceptanceRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium text-gray-900">{r.locationName}</div>
                          <div className="text-xs text-gray-500">ID: {r.locationId}</div>
                        </td>
                        <td className="p-3 text-sm text-gray-700">{r.requestedByUsername}</td>
                        <td className="p-3 text-sm text-gray-500">{formatDate(r.createdAt)}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openAcceptanceEdit(r)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                              title="Lokasyonu düzenle ve onayla"
                            >
                              Onayla
                            </button>
                            <button
                              onClick={async () => {
                                const ok = confirm(`\"${r.locationName}\" için isteği reddetmek istiyor musunuz?`);
                                if (!ok) return;
                                const success = await rejectAcceptanceRequest({
                                  requestId: r.id,
                                  adminUserId: currentUserId,
                                  adminUsername: currentUsername
                                });
                                if (!success) {
                                  setError('Reddetme işlemi başarısız');
                                  return;
                                }
                                setSuccessMessage('Reddedildi');
                                await loadAcceptanceRequests();
                              }}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                              title="Reddet"
                            >
                              Reddet
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

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
  );
}
