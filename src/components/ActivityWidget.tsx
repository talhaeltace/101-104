import { useState, useMemo } from 'react';
import {
  Activity,
  LogIn,
  LogOut,
  Edit,
  MapPin,
  X,
  Search,
  Clock,
  Timer,
  User,
  Calendar,
  TrendingUp,
} from 'lucide-react';

// Matches App.tsx format
export interface ActivityEntry {
  id: string;
  user: string;
  action: string;
  time: string;
  location_id?: string;
  location_name?: string;
  activity_type?: string;
  duration_minutes?: number;
}

interface ActivityWidgetProps {
  activities: ActivityEntry[];
  onClose?: () => void;
  isFullscreen?: boolean;
  inline?: boolean;
  fullHeight?: boolean;
  lastUpdated?: string | null;
  onOpenLocation?: (name: string) => void;
}

const formatTime = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const getRelativeTime = (dateStr: string): string => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays === 1) return 'Dün';
  if (diffDays < 7) return `${diffDays} gün önce`;
  return formatDate(dateStr);
};

const getActivityIcon = (type?: string, action?: string) => {
  const t = type?.toLowerCase() || action?.toLowerCase() || '';
  if (t.includes('login') || t.includes('giriş')) {
    return { icon: LogIn, color: 'text-emerald-400', bg: 'bg-emerald-500/30', label: 'Giriş' };
  }
  if (t.includes('logout') || t.includes('çıkış')) {
    return { icon: LogOut, color: 'text-orange-400', bg: 'bg-orange-500/30', label: 'Çıkış' };
  }
  if (t.includes('location') || t.includes('konum')) {
    return { icon: MapPin, color: 'text-purple-400', bg: 'bg-purple-500/30', label: 'Konum' };
  }
  if (t.includes('update') || t.includes('güncelle')) {
    return { icon: Edit, color: 'text-blue-400', bg: 'bg-blue-500/30', label: 'Güncelleme' };
  }
  return { icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-500/30', label: 'İşlem' };
};

type TabType = 'all' | 'auth' | 'updates' | 'location';

interface TabConfig {
  id: TabType;
  label: string;
  icon: typeof Activity;
}

const TABS: TabConfig[] = [
  { id: 'all', label: 'Tümü', icon: Activity },
  { id: 'auth', label: 'Giriş/Çıkış', icon: LogIn },
  { id: 'updates', label: 'İşlemler', icon: Edit },
  { id: 'location', label: 'Konum', icon: MapPin },
];

interface DateGroup {
  label: string;
  activities: ActivityEntry[];
}

const groupByDate = (activities: ActivityEntry[]): DateGroup[] => {
  const groups: Record<string, ActivityEntry[]> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  activities.forEach((activity) => {
    if (!activity.time) {
      if (!groups['Diğer']) groups['Diğer'] = [];
      groups['Diğer'].push(activity);
      return;
    }
    
    const activityDate = new Date(activity.time);
    if (isNaN(activityDate.getTime())) {
      if (!groups['Diğer']) groups['Diğer'] = [];
      groups['Diğer'].push(activity);
      return;
    }
    
    activityDate.setHours(0, 0, 0, 0);

    let label: string;
    if (activityDate.getTime() === today.getTime()) {
      label = 'Bugün';
    } else if (activityDate.getTime() === yesterday.getTime()) {
      label = 'Dün';
    } else {
      label = activityDate.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
      });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(activity);
  });

  const order = ['Bugün', 'Dün'];
  return Object.entries(groups)
    .sort(([a], [b]) => {
      const aIdx = order.indexOf(a);
      const bIdx = order.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      if (a === 'Diğer') return 1;
      if (b === 'Diğer') return -1;
      return 0;
    })
    .map(([label, acts]) => ({ label, activities: acts }));
};

const ActivityItem = ({ activity, onOpenLocation }: { activity: ActivityEntry; onOpenLocation?: (name: string) => void }) => {
  const { icon: Icon, color, bg, label } = getActivityIcon(activity.activity_type, activity.action);

  return (
    <div className="flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-white hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm">
      {/* Icon */}
      <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
          <span className="font-semibold text-gray-800 text-xs sm:text-sm">
            {activity.user || 'Bilinmeyen'}
          </span>
          <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium ${bg} ${color}`}>
            {label}
          </span>
        </div>

        <p className="text-[11px] sm:text-xs text-gray-600 line-clamp-2 mb-1">
          {activity.action || 'İşlem yapıldı'}
        </p>

        <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500 flex-wrap">
          {activity.time && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(activity.time)}
            </span>
          )}
          {activity.duration_minutes && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <Timer className="w-3 h-3" />
              {activity.duration_minutes} dk
            </span>
          )}
          {activity.location_name && (
            <button
              onClick={() => onOpenLocation?.(activity.location_name!)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
            >
              <MapPin className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{activity.location_name}</span>
            </button>
          )}
        </div>
      </div>

      {/* Time badge */}
      <div className="shrink-0 text-right hidden sm:block">
        <span className="text-[10px] sm:text-xs text-gray-400">
          {getRelativeTime(activity.time)}
        </span>
      </div>
    </div>
  );
};

const DateHeader = ({ label, count }: { label: string; count: number }) => (
  <div className="sticky top-0 z-10 flex items-center gap-2 py-1.5 sm:py-2 px-1 bg-gray-50/95 backdrop-blur-sm">
    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
    <span className="text-xs sm:text-sm font-semibold text-gray-700">{label}</span>
    <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-200 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
      {count} işlem
    </span>
  </div>
);

const StatCard = ({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  color: string;
}) => (
  <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-white border border-gray-200 shadow-sm">
    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${color} flex items-center justify-center`}>
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
    </div>
    <div>
      <div className="text-lg sm:text-xl font-bold text-gray-800">{value}</div>
      <div className="text-[10px] sm:text-xs text-gray-500">{label}</div>
    </div>
  </div>
);

const Content = ({
  activities,
  onClose,
  onOpenLocation,
}: Pick<ActivityWidgetProps, 'activities' | 'onClose' | 'onOpenLocation'>) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Get unique users
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    activities.forEach((a) => {
      if (a.user) users.add(a.user);
    });
    return Array.from(users);
  }, [activities]);

  // Today's stats
  const todayStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActivities = activities.filter((a) => {
      if (!a.time) return false;
      const date = new Date(a.time);
      if (isNaN(date.getTime())) return false;
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    });

    // Check both activity_type AND action for keywords
    const checkType = (a: ActivityEntry, keywords: string[]) => {
      const type = (a.activity_type || '').toLowerCase();
      const action = (a.action || '').toLowerCase();
      return keywords.some(k => type.includes(k) || action.includes(k));
    };

    return {
      total: todayActivities.length,
      logins: todayActivities.filter((a) => checkType(a, ['login', 'giriş'])).length,
      updates: todayActivities.filter((a) => checkType(a, ['update', 'güncelle', 'oluştur', 'silindi'])).length,
      locations: todayActivities.filter((a) => checkType(a, ['location', 'konum', 'rota', 'varış', 'tamamla'])).length,
    };
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    let result = [...activities];

    // Check both activity_type AND action for keywords
    const checkType = (a: ActivityEntry, keywords: string[]) => {
      const type = (a.activity_type || '').toLowerCase();
      const action = (a.action || '').toLowerCase();
      return keywords.some(k => type.includes(k) || action.includes(k));
    };

    // Tab filter
    if (activeTab === 'auth') {
      result = result.filter((a) => checkType(a, ['login', 'logout', 'giriş', 'çıkış']));
    } else if (activeTab === 'updates') {
      result = result.filter((a) => checkType(a, ['update', 'güncelle', 'oluştur', 'silindi', 'create', 'delete']));
    } else if (activeTab === 'location') {
      result = result.filter((a) => checkType(a, ['location', 'konum', 'rota', 'route', 'varış', 'tamamla']));
    }

    // User filter
    if (selectedUsers.length > 0) {
      result = result.filter((a) => selectedUsers.includes(a.user));
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          (a.user && a.user.toLowerCase().includes(query)) ||
          (a.action && a.action.toLowerCase().includes(query)) ||
          (a.location_name && a.location_name.toLowerCase().includes(query))
      );
    }

    return result;
  }, [activities, activeTab, selectedUsers, searchQuery]);

  // Group by date
  const groupedActivities = useMemo(
    () => groupByDate(filteredActivities),
    [filteredActivities]
  );

  const toggleUser = (userName: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userName) ? prev.filter((n) => n !== userName) : [...prev, userName]
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 p-3 sm:p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-800">Aktivite Geçmişi</h2>
              <p className="text-[10px] sm:text-xs text-gray-500">{activities.length} toplam işlem</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Today's Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 sm:mb-4">
          <StatCard icon={TrendingUp} label="Bugün" value={todayStats.total} color="bg-blue-600" />
          <StatCard icon={LogIn} label="Giriş" value={todayStats.logins} color="bg-green-600" />
          <StatCard icon={Edit} label="Güncelleme" value={todayStats.updates} color="bg-amber-600" />
          <StatCard icon={MapPin} label="Konum" value={todayStats.locations} color="bg-blue-500" />
        </div>

        {/* Search */}
        <div className="relative mb-2 sm:mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Ara... (kullanıcı, işlem, konum)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-gray-100 rounded-lg mb-2 sm:mb-3">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-1 sm:px-2 rounded-md text-[10px] sm:text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                }`}
              >
                <TabIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden xs:inline sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* User Filter Chips */}
        {uniqueUsers.length > 1 && (
          <div className="flex flex-wrap gap-1 sm:gap-1.5 max-h-16 overflow-y-auto">
            {uniqueUsers.slice(0, 10).map((userName) => {
              const isSelected = selectedUsers.includes(userName);
              return (
                <button
                  key={userName}
                  onClick={() => toggleUser(userName)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-700'
                  }`}
                >
                  <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  {userName}
                </button>
              );
            })}
            {selectedUsers.length > 0 && (
              <button
                onClick={() => setSelectedUsers([])}
                className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
              >
                Temizle
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
            <Activity className="w-10 h-10 sm:w-12 sm:h-12 mb-3 opacity-50" />
            <p className="text-xs sm:text-sm">Aktivite bulunamadı</p>
            {(searchQuery || selectedUsers.length > 0 || activeTab !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedUsers([]);
                  setActiveTab('all');
                }}
                className="mt-2 text-[10px] sm:text-xs text-blue-600 hover:text-blue-700"
              >
                Filtreleri temizle
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {groupedActivities.map((group) => (
              <div key={group.label}>
                <DateHeader label={group.label} count={group.activities.length} />
                <div className="space-y-1.5 sm:space-y-2 mt-1.5 sm:mt-2 mb-3 sm:mb-4">
                  {group.activities.map((activity) => (
                    <ActivityItem key={activity.id} activity={activity} onOpenLocation={onOpenLocation} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 p-2 sm:p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-500">
          <span>
            {filteredActivities.length === activities.length
              ? `${activities.length} aktivite`
              : `${filteredActivities.length} / ${activities.length} aktivite`}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Son: {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function ActivityWidget(props: ActivityWidgetProps) {
  const { isFullscreen, inline, fullHeight, activities, onClose, onOpenLocation } = props;
  
  // Inline mode - for embedding in other components
  if (inline) {
    return (
      <div className={`${fullHeight ? 'h-full' : ''} bg-gray-50`}>
        <Content activities={activities} onClose={onClose} onOpenLocation={onOpenLocation} />
      </div>
    );
  }

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50">
        <Content activities={activities} onClose={onClose} onOpenLocation={onOpenLocation} />
      </div>
    );
  }

  // Popup mode
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-2xl h-[90vh] sm:h-[85vh] bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <Content activities={activities} onClose={onClose} onOpenLocation={onOpenLocation} />
      </div>
    </div>
  );
}
