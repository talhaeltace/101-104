import { useState, useEffect } from 'react';
import {
  AppUser,
  UserPermissions,
  DEFAULT_PERMISSIONS,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  updateUserPermissions
} from '../lib/userPermissions';
import { listTasksCreatedByUser, updateTaskStatus, type Task } from '../lib/tasks';
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

interface AdminPanelProps {
  currentUserId: string;
  onClose: () => void;
}

export default function AdminPanel({ currentUserId, onClose }: AdminPanelProps) {
  useBodyScrollLock(true);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Admin: atanan görevleri gör
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Admin: editör tamamlama -> kabul onayı istekleri
  const [pendingAcceptanceRequests, setPendingAcceptanceRequests] = useState<AcceptanceRequest[]>([]);
  const [acceptanceLoading, setAcceptanceLoading] = useState(false);

  const [acceptanceEditRequest, setAcceptanceEditRequest] = useState<AcceptanceRequest | null>(null);
  const [acceptanceEditLocation, setAcceptanceEditLocation] = useState<Location | null>(null);
  const [acceptanceEditOriginalLocation, setAcceptanceEditOriginalLocation] = useState<Location | null>(null);
  const [isAcceptanceEditOpen, setIsAcceptanceEditOpen] = useState(false);


  // Yetki formu
  const [permissionsForm, setPermissionsForm] = useState<UserPermissions>({
    can_view: true,
    can_edit: false,
    can_create: false,
    can_delete: false,
    can_export: false,
    can_route: true,
    can_team_view: false
  });

  // Yeni kullanıcı formu
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'user',
    email: '',
    fullName: '',
    phone: ''
  });

  // Düzenleme formu
  const [editUser, setEditUser] = useState({
    username: '',
    password: '',
    role: 'user',
    email: '',
    fullName: '',
    phone: '',
    isActive: true
  });

  useEffect(() => {
    loadData();
  }, []);

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
    // realtime updates for tasks created by this admin
    const channel = supabase
      .channel(`tasks_created_${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `created_by_user_id=eq.${currentUserId}` },
        () => {
          loadAssignedTasks();
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const loadAcceptanceRequests = async () => {
    try {
      setAcceptanceLoading(true);
      const list = await listPendingAcceptanceRequests();
      setPendingAcceptanceRequests(list);
    } catch (e) {
      console.warn('loadAcceptanceRequests failed', e);
      setPendingAcceptanceRequests([]);
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
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('id', String(locationId))
        .maybeSingle();

      if (error || !data) {
        console.warn('fetchLocationById error', error);
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
      const { error } = await supabase
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

      if (error) {
        console.warn('updateLocationFromAdmin error', error);
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
    // keep an immutable snapshot for diff logging
    setAcceptanceEditOriginalLocation(JSON.parse(JSON.stringify(loc)) as Location);
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

    // A small, high-signal subset of flags that admins often correct
    addBool('Bina Kilitli', beforeDetails.isBuildingLocked, afterDetails.isBuildingLocked);
    addBool('Şalter Kapalı', beforeDetails.isSwitchOff, afterDetails.isSwitchOff);
    addBool('Kapı Kilitli', beforeDetails.isDoorLocked, afterDetails.isDoorLocked);
    addBool('Elektrik Yok', beforeDetails.hasNoPower, afterDetails.hasNoPower);

    return changes;
  };

  const closeAcceptanceEdit = () => {
    setIsAcceptanceEditOpen(false);
    setAcceptanceEditRequest(null);
    setAcceptanceEditLocation(null);
    setAcceptanceEditOriginalLocation(null);
  };

  const saveAcceptanceEditAndApprove = async (updatedLocation: Location) => {
    if (!acceptanceEditRequest || !acceptanceEditLocation) return;

    // Hard guard: only allow approving the location tied to the request
    if (String(updatedLocation.id) !== String(acceptanceEditRequest.locationId)) {
      console.error('Approval attempted with mismatched location id');
      return;
    }

    // Ensure acceptance flips on approve flow
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
      adminUsername: currentAdminUsername
    });

    if (!success) {
      setError('Onay işlemi başarısız');
      return;
    }

    try {
      const requestedBy = acceptanceEditRequest.requestedByUsername || acceptanceEditRequest.requestedByUserId || 'Bilinmiyor';
      const approvedBy = currentAdminUsername || currentUserId || 'Admin';
      const changeText = changes.length ? changes.join(' • ') : 'Değişiklik yok';
      await logActivity({
        username: approvedBy,
        action: `Kabul onayı: ${acceptedLocation.name} | Talep eden: ${requestedBy} | Onaylayan: ${approvedBy} | Değişenler: ${changeText}`,
        location_id: String(acceptedLocation.id),
        location_name: acceptedLocation.name,
        activity_type: 'general'
      });
    } catch (e) {
      // Non-blocking: approval already completed
      console.warn('Failed to log approval activity', e);
    }

    setSuccessMessage('Kaydedildi ve onaylandı');
    closeAcceptanceEdit();
    await loadAcceptanceRequests();
  };

  useEffect(() => {
    loadAcceptanceRequests();

    const channel = supabase
      .channel('location_acceptance_requests_admin_panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_acceptance_requests' }, () => {
        loadAcceptanceRequests();
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const usersData = await listUsers();
      setUsers(usersData);
    } catch (err) {
      setError('Veriler yüklenirken hata oluştu');
    }
    setLoading(false);
  };

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      setError('Kullanıcı adı ve şifre zorunludur');
      return;
    }

    const result = await createUser(
      newUser.username,
      newUser.password,
      newUser.role,
      newUser.email || undefined,
      newUser.fullName || undefined,
      newUser.phone || undefined
    );

    if (result.success) {
      setSuccessMessage('Kullanıcı oluşturuldu');
      setIsCreateModalOpen(false);
      setNewUser({ username: '', password: '', role: 'user', email: '', fullName: '', phone: '' });
      loadData();
    } else {
      setError(result.error || 'Kullanıcı oluşturulamadı');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    const result = await updateUser(selectedUser.id, {
      username: editUser.username || undefined,
      password: editUser.password || undefined,
      role: editUser.role || undefined,
      email: editUser.email || undefined,
      fullName: editUser.fullName || undefined,
      phone: editUser.phone || undefined,
      isActive: editUser.isActive
    });

    if (result.success) {
      setSuccessMessage('Kullanıcı güncellendi');
      setIsEditModalOpen(false);
      loadData();
    } else {
      setError(result.error || 'Kullanıcı güncellenemedi');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUserId) {
      setError('Kendinizi silemezsiniz');
      return;
    }
    
    if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;

    const result = await deleteUser(userId);

    if (result.success) {
      setSuccessMessage('Kullanıcı silindi');
      loadData();
    } else {
      setError(result.error || 'Kullanıcı silinemedi');
    }
  };

  const openEditModal = (user: AppUser) => {
    setSelectedUser(user);
    setEditUser({
      username: user.username,
      password: '',
      role: user.role,
      email: user.email || '',
      fullName: user.full_name || '',
      phone: user.phone || '',
      isActive: user.is_active
    });
    setIsEditModalOpen(true);
  };

  const openPermissionsModal = (user: AppUser) => {
    setSelectedUser(user);
    const roleDefaults = DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS['user'];
    setPermissionsForm({
      can_view: user.can_view ?? roleDefaults.can_view,
      can_edit: user.can_edit ?? roleDefaults.can_edit,
      can_create: user.can_create ?? roleDefaults.can_create,
      can_delete: user.can_delete ?? roleDefaults.can_delete,
      can_export: user.can_export ?? roleDefaults.can_export,
      can_route: user.can_route ?? roleDefaults.can_route,
      can_team_view: user.can_team_view ?? roleDefaults.can_team_view
    });
    setIsPermissionsModalOpen(true);
  };


  const handleSavePermissions = async () => {
    if (!selectedUser) return;

    const result = await updateUserPermissions(selectedUser.id, permissionsForm);

    if (result.success) {
      setSuccessMessage('Yetkiler güncellendi');
      setIsPermissionsModalOpen(false);
      loadData();
    } else {
      setError(result.error || 'Yetkiler güncellenemedi');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR');
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'editor': return 'bg-blue-100 text-blue-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  const currentAdminUsername = users.find(u => u.id === currentUserId)?.username;

  // Auto-hide messages
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1200]">
      <div className="bg-white w-full h-full overflow-hidden flex flex-col overscroll-contain">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Admin Paneli - Kullanıcı Yönetimi
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mx-4 mt-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMessage}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : (
            <>
              {/* Actions */}
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Yeni Kullanıcı
                </button>
                <button
                  onClick={() => {
                    loadData();
                    loadAssignedTasks();
                    loadAcceptanceRequests();
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Yenile
                </button>
              </div>

              {/* Assigned Tasks (created by this admin) */}
              <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Atanan Görevler</div>
                    <div className="text-xs text-gray-500">Senin atadığın görevler ({assignedTasks.length})</div>
                  </div>
                  <button
                    onClick={loadAssignedTasks}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    title="Yenile"
                  >
                    {tasksLoading ? 'Yükleniyor…' : 'Yenile'}
                  </button>
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
                          <td colSpan={6} className="p-6 text-center text-sm text-gray-500">Henüz görev atanmadı</td>
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

              {/* Acceptance Requests */}
              <div className="mb-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Kabul Onayları</div>
                    <div className="text-xs text-gray-500">Onay bekleyen kayıtlar ({pendingAcceptanceRequests.length})</div>
                  </div>
                  <button
                    onClick={loadAcceptanceRequests}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    title="Yenile"
                  >
                    {acceptanceLoading ? 'Yükleniyor…' : 'Yenile'}
                  </button>
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
                          <td colSpan={4} className="p-6 text-center text-sm text-gray-500">Onay bekleyen kayıt yok</td>
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
                                      adminUsername: currentAdminUsername
                                    });
                                    if (!success) {
                                      setError('Reddetme işlemi başarısız');
                                      return;
                                    }
                                    setSuccessMessage('Reddedildi');
                                    loadAcceptanceRequests();
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

              {/* Users Table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="p-3 text-left text-sm font-semibold text-gray-600">Kullanıcı</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-600">Rol</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-600">Yetkiler</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-600">Durum</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-600">Kayıt Tarihi</th>
                      <th className="p-3 text-center text-sm font-semibold text-gray-600">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          Henüz kullanıcı bulunmuyor
                        </td>
                      </tr>
                    ) : (
                      users.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900">{user.username}</div>
                                {user.full_name && <div className="text-sm text-gray-500">{user.full_name}</div>}
                                {user.email && <div className="text-xs text-gray-400">{user.email}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                              {user.role === 'admin' ? 'Admin' : user.role === 'editor' ? 'Editör' : user.role === 'viewer' ? 'Görüntüleyici' : 'Kullanıcı'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {user.can_view && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Görüntüle</span>}
                              {user.can_edit && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Düzenle</span>}
                              {user.can_create && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Ekle</span>}
                              {user.can_delete && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">Sil</span>}
                              {user.can_export && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">Dışa Aktar</span>}
                              {user.can_route && <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">Rota</span>}
                              {user.can_team_view && <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs">Ekip</span>}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              {user.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="p-3 text-sm text-gray-500">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-center gap-1">
                              <button
                                onClick={() => openEditModal(user)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Düzenle"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => openPermissionsModal(user)}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Yetkiler"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Sil"
                                disabled={user.id === currentUserId}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* User count */}
              <div className="mt-4 text-sm text-gray-500">
                Toplam {users.length} kullanıcı
              </div>
            </>
          )}
        </div>

        {/* Acceptance edit flow: edit location then approve request on save */}
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

        {/* Create User Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1210] p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Yeni Kullanıcı Oluştur
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={e => setNewUser({...newUser, username: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ornek_kullanici"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Şifre *</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="user">Kullanıcı</option>
                    <option value="viewer">Görüntüleyici</option>
                    <option value="editor">Editör</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    value={newUser.fullName}
                    onChange={e => setNewUser({...newUser, fullName: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ahmet Yılmaz"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ornek@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={newUser.phone}
                    onChange={e => setNewUser({...newUser, phone: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0555 123 4567"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleCreateUser}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Oluştur
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {isEditModalOpen && selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1210] p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Kullanıcı Düzenle: {selectedUser.username}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={editUser.username}
                    onChange={e => setEditUser({...editUser, username: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre (boş bırakılırsa değişmez)</label>
                  <input
                    type="password"
                    value={editUser.password}
                    onChange={e => setEditUser({...editUser, password: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={editUser.role}
                    onChange={e => setEditUser({...editUser, role: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="user">Kullanıcı</option>
                    <option value="viewer">Görüntüleyici</option>
                    <option value="editor">Editör</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    value={editUser.fullName}
                    onChange={e => setEditUser({...editUser, fullName: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
                  <input
                    type="email"
                    value={editUser.email}
                    onChange={e => setEditUser({...editUser, email: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={editUser.phone}
                    onChange={e => setEditUser({...editUser, phone: e.target.value})}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editUser.isActive}
                    onChange={e => setEditUser({...editUser, isActive: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Aktif</label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpdateUser}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permissions Modal */}
        {isPermissionsModalOpen && selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1210] p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Yetki Yönetimi: {selectedUser.username}
              </h3>

              <p className="text-sm text-gray-500 mb-4">
                Bu kullanıcının uygulama içindeki yetkilerini düzenleyin.
              </p>
              
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_view}
                    onChange={e => setPermissionsForm({...permissionsForm, can_view: e.target.checked})}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Görüntüleme</div>
                    <div className="text-xs text-gray-500">Lokasyonları ve verileri görüntüleyebilir</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_edit}
                    onChange={e => setPermissionsForm({...permissionsForm, can_edit: e.target.checked})}
                    className="w-5 h-5 text-yellow-600 rounded focus:ring-yellow-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Düzenleme</div>
                    <div className="text-xs text-gray-500">Mevcut lokasyonları düzenleyebilir</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_create}
                    onChange={e => setPermissionsForm({...permissionsForm, can_create: e.target.checked})}
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Ekleme</div>
                    <div className="text-xs text-gray-500">Yeni lokasyon ekleyebilir</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_delete}
                    onChange={e => setPermissionsForm({...permissionsForm, can_delete: e.target.checked})}
                    className="w-5 h-5 text-red-600 rounded focus:ring-red-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Silme</div>
                    <div className="text-xs text-gray-500">Lokasyonları silebilir</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_export}
                    onChange={e => setPermissionsForm({...permissionsForm, can_export: e.target.checked})}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Dışa Aktarma</div>
                    <div className="text-xs text-gray-500">Verileri dışa aktarabilir (Excel, PDF vb.)</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_route}
                    onChange={e => setPermissionsForm({...permissionsForm, can_route: e.target.checked})}
                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Rota Oluşturma</div>
                    <div className="text-xs text-gray-500">Route Builder ile rota oluşturabilir</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissionsForm.can_team_view}
                    onChange={e => setPermissionsForm({...permissionsForm, can_team_view: e.target.checked})}
                    className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Ekip Durumu</div>
                    <div className="text-xs text-gray-500">Ekip panelini ve diğer kullanıcıları görebilir</div>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setIsPermissionsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
