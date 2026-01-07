import React, { useState, useEffect, useRef } from 'react';
import { Clock, LogIn, LogOut, Edit, Activity, X, ChevronRight } from 'lucide-react';

export interface ActivityEntry {
  id: string;
  user: string;
  action: string;
  time: string; // ISO
  location_id?: string;
  location_name?: string;
  activity_type?: 'arrival' | 'completion' | 'general';
  duration_minutes?: number;
}

interface Props {
  lastUpdated?: string | null;
  activities: ActivityEntry[];
  inline?: boolean;
  fullHeight?: boolean;
  onOpenLocation?: (name: string) => void;
}

const formatTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
};

const ActivityWidget: React.FC<Props> = ({ lastUpdated, activities, inline, fullHeight, onOpenLocation }) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'login' | 'updates' | 'other'>('all');
  const widgetRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const parseLocationName = (action: string): string | null => {
    if (!action) return null;
    const m = action.match(/^(Güncellendi|Oluşturuldu|Silindi):\s*(.+)$/i);
    if (m) return m[2].trim();

    // Approval logs: "Kabul onayı: <Lokasyon> | ..."
    const a = action.match(/^Kabul\s*onayı:\s*([^|]+?)(\s*\||$)/i);
    return a ? a[1].trim() : null;
  };

  const getIcon = (action: string) => {
    if (/giriş yaptı/i.test(action)) return <LogIn className="w-4 h-4 text-green-600" />;
    if (/çıkış yaptı|otomatik çıkış/i.test(action)) return <LogOut className="w-4 h-4 text-red-600" />;
    if (/güncellendi|oluşturuldu|silindi/i.test(action)) return <Edit className="w-4 h-4 text-blue-600" />;
    return <Activity className="w-4 h-4 text-gray-500" />;
  };

  const filteredActivities = activities.filter(a => {
    if (activeTab === 'all') return true;
    if (activeTab === 'login') return /giriş yaptı|çıkış yaptı|otomatik çıkış/i.test(a.action);
    if (activeTab === 'updates') return parseLocationName(a.action);
    if (activeTab === 'other') return !/giriş yaptı|çıkış yaptı|otomatik çıkış/i.test(a.action) && !parseLocationName(a.action);
    return true;
  });

  const ActivityItem = ({ item }: { item: ActivityEntry }) => {
    const locationName = parseLocationName(item.action);
    const actionClass = fullHeight
      ? 'text-sm text-gray-600 whitespace-normal break-words'
      : 'text-sm text-gray-600 truncate';
    
    return (
      <div className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-50 last:border-0">
        <div className="mt-1 p-1.5 bg-gray-100 rounded-full shrink-0">
          {getIcon(item.action)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm text-gray-900">{item.user}</span>
            </div>
            <div className="text-xs text-gray-400 whitespace-nowrap flex flex-col items-end">
              <span>{formatTime(item.time)}</span>
              <span className="text-[10px] text-gray-300">{formatDate(item.time)}</span>
            </div>
          </div>
          
          {locationName ? (
            <button 
              onClick={() => {
                if (onOpenLocation) {
                  onOpenLocation(locationName);
                  setOpen(false);
                }
              }}
              className="group flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors text-left w-full"
            >
              <span className={fullHeight ? 'whitespace-normal break-words' : 'truncate'}>{item.action}</span>
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ) : (
            <p className={actionClass}>{item.action}</p>
          )}
        </div>
      </div>
    );
  };

  const Content = () => (
    <div className={fullHeight ? "flex flex-col h-full" : "flex flex-col h-full max-h-[500px]"}>
      <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Aktivite Geçmişi</h3>
            <p className="text-xs text-gray-500 mt-0.5">Son güncellemeler ve kullanıcı hareketleri</p>
          </div>
          {!inline && (
            <button 
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Tümü' },
            { id: 'login', label: 'Giriş/Çıkış' },
            { id: 'updates', label: 'İşlemler' },
            { id: 'other', label: 'Diğer' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Activity className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">Kayıt bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredActivities.map(activity => (
              <ActivityItem key={activity.id} item={activity} />
            ))}
          </div>
        )}
      </div>
      
      <div className="p-3 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-400">
        Son güncelleme: {lastUpdated ? new Date(lastUpdated).toLocaleString('tr-TR') : '—'}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Content />
      </div>
    );
  }

  return (
    <div className="relative" ref={widgetRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-3 px-4 py-2 rounded-full border transition-all duration-200 ${
          open 
            ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' 
            : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
        }`}
      >
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Son Güncelleme</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-sm font-bold text-gray-800 tabular-nums">
              {formatTime(lastUpdated)}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(380px,calc(100vw-2rem))] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          <Content />
        </div>
      )}
    </div>
  );
};

export default ActivityWidget;
