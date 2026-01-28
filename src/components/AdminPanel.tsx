import { useState, useEffect } from 'react';
import {
  Users, X, RefreshCw, UserPlus, Shield, Edit3, Trash2, 
  CheckCircle2, AlertCircle, Search, Crown, Eye, Pencil, 
  ChevronDown, Mail, Phone, Calendar, Zap,
  Lock, Unlock, UserCheck
} from 'lucide-react';
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
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface AdminPanelProps {
  currentUserId: string;
  onClose: () => void;
}

const roleConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  admin: {
    label: 'Admin',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-200',
    icon: Crown
  },
  editor: {
    label: 'Editör',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    icon: Pencil
  },
  viewer: {
    label: 'Görüntüleyici',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
    icon: Eye
  },
  user: {
    label: 'Kullanıcı',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    borderColor: 'border-emerald-200',
    icon: UserCheck
  }
};

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
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const [permissionsForm, setPermissionsForm] = useState<UserPermissions>({
    can_view: true,
    can_edit: false,
    can_create: false,
    can_delete: false,
    can_export: false,
    can_route: true,
    can_team_view: false,
    can_manual_gps: false
  });

  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'user',
    email: '',
    fullName: '',
    phone: ''
  });

  const [editUser, setEditUser] = useState({
    username: '',
    password: '',
    role: 'user',
    email: '',
    fullName: '',
    phone: '',
    isActive: true,
    otpRequired: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const usersData = await listUsers();
      setUsers(usersData);
    } catch {
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
      isActive: editUser.isActive,
      otpRequired: editUser.otpRequired
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
      isActive: user.is_active,
      otpRequired: user.otp_required !== false
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
      can_team_view: user.can_team_view ?? roleDefaults.can_team_view,
      can_manual_gps: user.can_manual_gps ?? roleDefaults.can_manual_gps
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
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

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
    total: users.length,
    active: users.filter(u => u.is_active).length,
    admins: users.filter(u => u.role === 'admin').length,
    editors: users.filter(u => u.role === 'editor').length
  };

  // Filtered users
  const filteredUsers = users.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.username.toLowerCase().includes(q) || 
           u.full_name?.toLowerCase().includes(q) ||
           u.email?.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50 overflow-hidden">
      <div className="w-full h-full flex flex-col overflow-hidden">

        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm safe-area-top">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg sm:rounded-xl shadow-sm shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">Admin Paneli</h1>
                <p className="text-[10px] sm:text-xs text-gray-500">Kullanıcı ve yetki yönetimi</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={loadData}
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

          {/* Stats Cards - 2x2 on mobile */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">Toplam</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-gray-800">{stats.total}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-emerald-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-emerald-600">Aktif</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-emerald-600">{stats.active}</div>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-red-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Crown className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-red-600">Admin</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-red-600">{stats.admins}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-blue-200/60">
                <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                  <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-blue-600">Editör</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-blue-600">{stats.editors}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Search & Actions */}
        <div className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex gap-2 sm:gap-3">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Kullanıcı ara..."
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-white border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 placeholder-gray-400 text-xs sm:text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 transition-all"
              />
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3 sm:px-4 py-2 sm:py-2.5 bg-rose-600 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold shadow-sm hover:bg-rose-700 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">Yeni</span> <span className="hidden sm:inline">Kullanıcı</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-3 sm:mx-4 mt-3 sm:mt-4 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
            <span className="text-xs sm:text-sm text-red-700">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-3 sm:mx-4 mt-3 sm:mt-4 p-2.5 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
            <span className="text-xs sm:text-sm text-emerald-700">{successMessage}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 bg-gray-50 overflow-x-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="relative">
                <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl animate-pulse" />
                <RefreshCw className="relative w-10 h-10 sm:w-12 sm:h-12 animate-spin text-rose-600" />
              </div>
              <p className="text-gray-500 mt-4 text-sm sm:text-base">Kullanıcılar yükleniyor...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl mb-3 shadow-sm">
                <Users className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-500 text-center">
                {searchQuery ? 'Kullanıcı bulunamadı' : 'Henüz kullanıcı yok'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {filteredUsers.map(user => {
                const config = roleConfig[user.role] || roleConfig.user;
                const isExpanded = expandedUserId === user.id;
                const isSelf = user.id === currentUserId;

                return (
                  <div 
                    key={user.id} 
                    className={`bg-white border rounded-xl sm:rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all ${
                      user.is_active ? config.borderColor : 'border-gray-200'
                    }`}
                  >
                    {/* User Header */}
                    <div 
                      className="p-2.5 sm:p-4 cursor-pointer"
                      onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                    >
                      <div className="flex items-center gap-2.5 sm:gap-2.5 sm:gap-4">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-sm ${
                            user.is_active ? 'bg-gradient-to-br from-rose-500 to-rose-600' : 'bg-gray-400'
                          }`}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-white ${
                            user.is_active ? 'bg-emerald-500' : 'bg-gray-400'
                          }`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                            <h3 className="font-semibold text-gray-800 truncate text-sm sm:text-base">{user.username}</h3>
                            {isSelf && (
                              <span className="px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide rounded-full bg-rose-100 text-rose-600 shrink-0">
                                Sen
                              </span>
                            )}
                            <span className={`px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide rounded-full shrink-0 ${config.bgColor} ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-gray-500">
                            {user.full_name && (
                              <span className="truncate max-w-[100px] sm:max-w-none">{user.full_name}</span>
                            )}
                            {user.email && (
                              <span className="hidden sm:flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="shrink-0 flex items-center gap-1 sm:gap-2">
                          <span className={`hidden sm:flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium ${
                            user.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {user.is_active ? <Unlock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                            {user.is_active ? 'Aktif' : 'Pasif'}
                          </span>
                          <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <div className="pt-4 space-y-4">
                          {/* User Details */}
                          <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                              <div className="text-[8px] sm:text-[10px] uppercase text-gray-500 mb-0.5 sm:mb-1">E-posta</div>
                              <div className="text-[10px] sm:text-sm text-gray-800 font-medium flex items-center gap-1 sm:gap-2 truncate">
                                <Mail className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                                <span className="truncate">{user.email || '-'}</span>
                              </div>
                            </div>
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                              <div className="text-[8px] sm:text-[10px] uppercase text-gray-500 mb-0.5 sm:mb-1">Telefon</div>
                              <div className="text-[10px] sm:text-sm text-gray-800 font-medium flex items-center gap-1 sm:gap-2">
                                <Phone className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                                {user.phone || '-'}
                              </div>
                            </div>
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                              <div className="text-[8px] sm:text-[10px] uppercase text-gray-500 mb-0.5 sm:mb-1">Kayıt Tarihi</div>
                              <div className="text-[10px] sm:text-sm text-gray-800 font-medium flex items-center gap-1 sm:gap-2">
                                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                                {formatDate(user.created_at)}
                              </div>
                            </div>
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                              <div className="text-[8px] sm:text-[10px] uppercase text-gray-500 mb-0.5 sm:mb-1">OTP Durumu</div>
                              <div className="text-[10px] sm:text-sm text-gray-800 font-medium flex items-center gap-1 sm:gap-2">
                                <Shield className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                                {user.otp_required !== false ? 'Zorunlu' : 'Kapalı'}
                              </div>
                            </div>
                          </div>

                          {/* Permissions */}
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-gray-200/60">
                            <div className="text-[8px] sm:text-[10px] uppercase text-gray-500 mb-1.5 sm:mb-2">Yetkiler</div>
                            <div className="flex flex-wrap gap-1 sm:gap-1.5">
                              {user.can_view && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-50 text-blue-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-blue-200/60">Görüntüle</span>}
                              {user.can_edit && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-amber-50 text-amber-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-amber-200/60">Düzenle</span>}
                              {user.can_create && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-emerald-50 text-emerald-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-emerald-200/60">Ekle</span>}
                              {user.can_delete && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-50 text-red-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-red-200/60">Sil</span>}
                              {user.can_export && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-50 text-purple-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-purple-200/60">Dışa Aktar</span>}
                              {user.can_route && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-indigo-50 text-indigo-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-indigo-200/60">Rota</span>}
                              {user.can_team_view && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-teal-50 text-teal-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-teal-200/60">Ekip</span>}
                              {user.can_manual_gps && <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 text-gray-600 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium border border-gray-200/60">Manuel GPS</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1.5 sm:gap-2">
                            <button
                              onClick={() => openEditModal(user)}
                              className="flex-1 px-2 sm:px-4 py-2 sm:py-2.5 bg-blue-50 text-blue-600 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-semibold hover:bg-blue-100 transition-all flex items-center justify-center gap-1 sm:gap-2 border border-blue-200"
                            >
                              <Edit3 className="w-3 h-3 sm:w-4 sm:h-4" />
                              <span className="hidden xs:inline">Düzenle</span>
                            </button>
                            <button
                              onClick={() => openPermissionsModal(user)}
                              className="flex-1 px-2 sm:px-4 py-2 sm:py-2.5 bg-purple-50 text-purple-600 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-semibold hover:bg-purple-100 transition-all flex items-center justify-center gap-1 sm:gap-2 border border-purple-200"
                            >
                              <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
                              <span className="hidden xs:inline">Yetkiler</span>
                            </button>
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="px-2 sm:px-4 py-2 sm:py-2.5 bg-red-50 text-red-600 rounded-lg sm:rounded-xl text-[10px] sm:text-sm font-semibold hover:bg-red-100 transition-all flex items-center justify-center gap-1 sm:gap-2 border border-red-200"
                              >
                                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              </button>
                            )}
                          </div>
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
            <span className="flex items-center gap-1.5 sm:gap-2">
              <Users className="w-3 h-3 sm:w-4 sm:h-4" />
              {users.length} kullanıcı kayıtlı
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md font-medium">
              {stats.active} aktif
            </span>
          </div>
        </footer>

        {/* Create User Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100000] p-2 sm:p-4 flex items-end sm:items-center justify-center">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full max-w-md shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="p-2 sm:p-2.5 bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg sm:rounded-xl shadow-sm">
                  <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-gray-800">Yeni Kullanıcı</h3>
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={e => setNewUser({...newUser, username: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Şifre *</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser({...newUser, password: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Rol</label>
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                  >
                    <option value="user">Kullanıcı</option>
                    <option value="viewer">Görüntüleyici</option>
                    <option value="editor">Editör</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Ad Soyad</label>
                  <input
                    type="text"
                    value={newUser.fullName}
                    onChange={e => setNewUser({...newUser, fullName: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">E-posta</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Telefon</label>
                  <input
                    type="tel"
                    value={newUser.phone}
                    onChange={e => setNewUser({...newUser, phone: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
              </div>

              <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 text-gray-700 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleCreateUser}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-rose-600 text-white rounded-lg sm:rounded-xl text-sm font-semibold shadow-sm hover:bg-rose-700 transition-all"
                >
                  Oluştur
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {isEditModalOpen && selectedUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100000] p-2 sm:p-4 flex items-end sm:items-center justify-center">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full max-w-md shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="p-2 sm:p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl shadow-sm">
                  <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-800">Kullanıcı Düzenle</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{selectedUser.username}</p>
                </div>
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={editUser.username}
                    onChange={e => setEditUser({...editUser, username: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Yeni Şifre (boş = değişmez)</label>
                  <input
                    type="password"
                    value={editUser.password}
                    onChange={e => setEditUser({...editUser, password: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Rol</label>
                  <select
                    value={editUser.role}
                    onChange={e => setEditUser({...editUser, role: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  >
                    <option value="user">Kullanıcı</option>
                    <option value="viewer">Görüntüleyici</option>
                    <option value="editor">Editör</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Ad Soyad</label>
                  <input
                    type="text"
                    value={editUser.fullName}
                    onChange={e => setEditUser({...editUser, fullName: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">E-posta</label>
                  <input
                    type="email"
                    value={editUser.email}
                    onChange={e => setEditUser({...editUser, email: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">Telefon</label>
                  <input
                    type="tel"
                    value={editUser.phone}
                    onChange={e => setEditUser({...editUser, phone: e.target.value})}
                    className="w-full p-2.5 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-sm text-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  />
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editUser.isActive}
                      onChange={e => setEditUser({...editUser, isActive: e.target.checked})}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded bg-gray-50 border-gray-300 text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <span className="text-xs sm:text-sm text-gray-700">Aktif</span>
                  </label>
                  <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editUser.otpRequired}
                      onChange={e => setEditUser({...editUser, otpRequired: e.target.checked})}
                      className="w-4 h-4 sm:w-5 sm:h-5 rounded bg-gray-50 border-gray-300 text-purple-500 focus:ring-purple-500/50"
                    />
                    <span className="text-xs sm:text-sm text-gray-700">OTP Zorunlu</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 text-gray-700 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpdateUser}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg sm:rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-700 transition-all"
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permissions Modal */}
        {isPermissionsModalOpen && selectedUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100000] p-2 sm:p-4 flex items-end sm:items-center justify-center">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full max-w-md shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="p-2 sm:p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg sm:rounded-xl shadow-sm">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-800">Yetki Yönetimi</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{selectedUser.username}</p>
                </div>
              </div>
              
              <div className="space-y-1.5 sm:space-y-2">
                {[
                  { key: 'can_view', label: 'Görüntüleme', desc: 'Lokasyonları ve verileri görüntüleyebilir', color: 'blue' },
                  { key: 'can_edit', label: 'Düzenleme', desc: 'Mevcut lokasyonları düzenleyebilir', color: 'amber' },
                  { key: 'can_create', label: 'Ekleme', desc: 'Yeni lokasyon ekleyebilir', color: 'emerald' },
                  { key: 'can_delete', label: 'Silme', desc: 'Lokasyonları silebilir', color: 'red' },
                  { key: 'can_export', label: 'Dışa Aktarma', desc: 'Verileri dışa aktarabilir', color: 'purple' },
                  { key: 'can_route', label: 'Rota Oluşturma', desc: 'Route Builder ile rota oluşturabilir', color: 'indigo' },
                  { key: 'can_team_view', label: 'Ekip Durumu', desc: 'Ekip panelini görebilir', color: 'teal' },
                  { key: 'can_manual_gps', label: 'Manuel GPS', desc: 'GPS olmadan "Adrese Vardım" kullanabilir', color: 'slate' }
                ].map(perm => (
                  <label 
                    key={perm.key} 
                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl cursor-pointer transition-colors ${
                      (permissionsForm as any)[perm.key] 
                        ? `bg-${perm.color}-50 border border-${perm.color}-200` 
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(permissionsForm as any)[perm.key]}
                      onChange={e => setPermissionsForm({...permissionsForm, [perm.key]: e.target.checked})}
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded bg-gray-50 border-gray-300 text-${perm.color}-500 focus:ring-${perm.color}-500/50`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs sm:text-sm font-medium ${(permissionsForm as any)[perm.key] ? 'text-gray-800' : 'text-gray-700'}`}>
                        {perm.label}
                      </div>
                      <div className="text-[10px] sm:text-xs text-gray-500 truncate">{perm.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  onClick={() => setIsPermissionsModalOpen(false)}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 text-gray-700 rounded-lg sm:rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleSavePermissions}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-purple-600 text-white rounded-lg sm:rounded-xl text-sm font-semibold shadow-sm hover:bg-purple-700 transition-all"
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
