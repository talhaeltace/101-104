import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  ArrowLeft, ArrowRight, Calendar, ChevronDown, RefreshCw, 
  Timer, X, Clock, Briefcase, Car, TrendingUp, Users, CheckCircle2,
  BarChart3, MapPin, Zap, Target, Play, Coffee, Search
} from 'lucide-react';
import { listWorkEntries, type WorkEntryRow } from '../lib/workEntries';
import { formatDuration as formatMinutes } from '../lib/teamStatus';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

type MesaiDaySummary = {
  date: string;
  completedCount: number;
  normalCompletedCount: number;
  overtimeCompletedCount: number;
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  normalWorkMinutes: number;
  overtimeWorkMinutes: number;
  normalTravelMinutes: number;
  overtimeTravelMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  firstAt: string | null;
  lastAt: string | null;
};

type MesaiUserSummary = {
  username: string;
  days: Record<string, MesaiDaySummary>;
  total: MesaiDaySummary;
  completions: Array<{
    date: string;
    locationName: string;
    departedAt: string | null;
    arrivedAt: string | null;
    completedAt: string | null;
    travelMinutes: number;
    workMinutes: number;
    normalWorkMinutes: number;
    overtimeWorkMinutes: number;
    normalTravelMinutes: number;
    overtimeTravelMinutes: number;
    normalMinutes: number;
    overtimeMinutes: number;
  }>;
};

const toLocalYmd = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const toYyyyMm = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const shiftYyyyMm = (yyyyMm: string, deltaMonths: number) => {
  const { start } = monthBoundsFromYyyyMm(yyyyMm);
  const d = new Date(start.getFullYear(), start.getMonth() + deltaMonths, 1, 0, 0, 0, 0);
  return toYyyyMm(d);
};

const toIsoYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const monthBoundsFromYyyyMm = (yyyyMm: string) => {
  const fallback = new Date();
  const [yStr, mStr] = String(yyyyMm || '').split('-');
  const yearRaw = Number(yStr);
  const monthRaw = Number(mStr);
  const year = Number.isFinite(yearRaw) && yearRaw >= 1970 ? yearRaw : fallback.getFullYear();
  const monthIndex = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw - 1 : fallback.getMonth();
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const formatMonthTr = (yyyyMm: string) => {
  const { start } = monthBoundsFromYyyyMm(yyyyMm);
  try {
    return start.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  } catch {
    return yyyyMm;
  }
};

const startOfLocalDayIso = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toISOString();
};

const endOfLocalDayIso = (ymd: string) => {
  const d = new Date(`${ymd}T23:59:59.999`);
  return d.toISOString();
};

const getNormalIntervalsForLocalDate = (d: Date): Array<[number, number]> => {
  const day = d.getDay();
  if (day === 0) return [];
  if (day === 6) return [[9 * 60, 14 * 60]];
  return [[9 * 60, 18 * 60]];
};

const overlapMinutes = (startMin: number, endMin: number, intervals: Array<[number, number]>): number => {
  if (endMin <= startMin) return 0;
  let sum = 0;
  for (const [a, b] of intervals) {
    const s = Math.max(startMin, a);
    const e = Math.min(endMin, b);
    if (e > s) sum += e - s;
  }
  return Math.max(0, Math.round(sum));
};

const allocateMinutesBySchedule = (startIso: string, endIso: string) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const out = new Map<string, { total: number; normal: number; overtime: number }>();
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime())) return out;
  if (end.getTime() <= start.getTime()) return out;

  let cursor = new Date(start.getTime());
  while (cursor.getTime() < end.getTime()) {
    const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
    const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const segStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
    const segEnd = new Date(Math.min(end.getTime(), nextDayStart.getTime()));
    if (segEnd.getTime() <= segStart.getTime()) {
      cursor = nextDayStart;
      continue;
    }

    const minutes = Math.max(0, Math.round((segEnd.getTime() - segStart.getTime()) / 60000));
    const startMin = (segStart.getTime() - dayStart.getTime()) / 60000;
    const endMin = (segEnd.getTime() - dayStart.getTime()) / 60000;

    const intervals = getNormalIntervalsForLocalDate(dayStart);
    const normal = overlapMinutes(startMin, endMin, intervals);
    const overtime = Math.max(0, minutes - normal);

    const ymd = toLocalYmd(dayStart.toISOString());
    const prev = out.get(ymd) || { total: 0, normal: 0, overtime: 0 };
    out.set(ymd, {
      total: prev.total + minutes,
      normal: prev.normal + normal,
      overtime: prev.overtime + overtime
    });

    cursor = nextDayStart;
  }

  return out;
};

const sumAllocTotals = (alloc: Map<string, { total: number; normal: number; overtime: number }>) => {
  let total = 0;
  let normal = 0;
  let overtime = 0;
  for (const v of alloc.values()) {
    total += Number(v.total || 0);
    normal += Number(v.normal || 0);
    overtime += Number(v.overtime || 0);
  }
  return { total, normal, overtime };
};

const formatTime = (isoString: string) => {
  return new Date(isoString).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const computeMesaiFromWorkEntries = (rows: WorkEntryRow[], startYmd: string, endYmd: string): MesaiUserSummary[] => {
  const userMap = new Map<string, MesaiUserSummary>();

  const ensureUser = (username: string) => {
    const key = String(username || '').trim() || 'bilinmeyen';
    const normKey = key.toLocaleLowerCase('tr-TR');
    let u = userMap.get(normKey);
    if (!u) {
      const emptyTotal: MesaiDaySummary = {
        date: `${startYmd}..${endYmd}`,
        completedCount: 0,
        normalCompletedCount: 0,
        overtimeCompletedCount: 0,
        workMinutes: 0,
        travelMinutes: 0,
        totalMinutes: 0,
        normalWorkMinutes: 0,
        overtimeWorkMinutes: 0,
        normalTravelMinutes: 0,
        overtimeTravelMinutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        firstAt: null,
        lastAt: null
      };
      u = { username: key, days: {}, total: emptyTotal, completions: [] };
      userMap.set(normKey, u);
    }
    return u;
  };

  const ensureDay = (u: MesaiUserSummary, date: string) => {
    let d = u.days[date];
    if (!d) {
      d = {
        date,
        completedCount: 0,
        normalCompletedCount: 0,
        overtimeCompletedCount: 0,
        workMinutes: 0,
        travelMinutes: 0,
        totalMinutes: 0,
        normalWorkMinutes: 0,
        overtimeWorkMinutes: 0,
        normalTravelMinutes: 0,
        overtimeTravelMinutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        firstAt: null,
        lastAt: null
      };
      u.days[date] = d;
    }
    return d;
  };

  const bumpWindow = (d: MesaiDaySummary, iso: string | null) => {
    if (!iso) return;
    if (!d.firstAt || new Date(iso).getTime() < new Date(d.firstAt).getTime()) d.firstAt = iso;
    if (!d.lastAt || new Date(iso).getTime() > new Date(d.lastAt).getTime()) d.lastAt = iso;
  };

  for (const r of rows) {
    const u = ensureUser(r.username);

    const travelMins = Number(r.travel_minutes || 0);
    const workMins = Number(r.work_minutes || 0);
    const departedAt = r.departed_at || (travelMins > 0 ? new Date(new Date(r.arrived_at).getTime() - travelMins * 60000).toISOString() : null);
    const arrivedAt = r.arrived_at;
    const completedAt = r.completed_at;

    let travelTotals = { total: 0, normal: 0, overtime: 0 };
    if (departedAt && arrivedAt && new Date(arrivedAt).getTime() > new Date(departedAt).getTime()) {
      travelTotals = sumAllocTotals(allocateMinutesBySchedule(departedAt, arrivedAt));
    }

    let workTotals = { total: 0, normal: 0, overtime: 0 };
    if (arrivedAt && completedAt && new Date(completedAt).getTime() > new Date(arrivedAt).getTime()) {
      workTotals = sumAllocTotals(allocateMinutesBySchedule(arrivedAt, completedAt));
    }

    const completionNormalMinutes = travelTotals.normal + workTotals.normal;
    const completionOvertimeMinutes = travelTotals.overtime + workTotals.overtime;

    if (departedAt && arrivedAt && new Date(arrivedAt).getTime() > new Date(departedAt).getTime()) {
      const alloc = allocateMinutesBySchedule(departedAt, arrivedAt);
      for (const [ymd, a] of alloc.entries()) {
        const day = ensureDay(u, ymd);
        day.travelMinutes += a.total;
        day.normalTravelMinutes += a.normal;
        day.overtimeTravelMinutes += a.overtime;
        bumpWindow(day, departedAt);
        bumpWindow(day, arrivedAt);
      }
    } else if (arrivedAt) {
      bumpWindow(ensureDay(u, toLocalYmd(arrivedAt)), arrivedAt);
    }

    if (arrivedAt && completedAt && new Date(completedAt).getTime() > new Date(arrivedAt).getTime()) {
      const alloc = allocateMinutesBySchedule(arrivedAt, completedAt);
      for (const [ymd, a] of alloc.entries()) {
        const day = ensureDay(u, ymd);
        day.workMinutes += a.total;
        day.normalWorkMinutes += a.normal;
        day.overtimeWorkMinutes += a.overtime;
        bumpWindow(day, arrivedAt);
        bumpWindow(day, completedAt);
      }
    } else if (completedAt) {
      bumpWindow(ensureDay(u, toLocalYmd(completedAt)), completedAt);
    }

    const completionDay = toLocalYmd(completedAt);
    const completionDaySummary = ensureDay(u, completionDay);
    completionDaySummary.completedCount += 1;
    if (completionNormalMinutes > 0) completionDaySummary.normalCompletedCount += 1;
    if (completionOvertimeMinutes > 0) completionDaySummary.overtimeCompletedCount += 1;

    u.completions.push({
      date: completionDay,
      locationName: r.location_name || 'Lokasyon',
      departedAt,
      arrivedAt,
      completedAt,
      travelMinutes: travelMins,
      workMinutes: workMins,
      normalWorkMinutes: workTotals.normal,
      overtimeWorkMinutes: workTotals.overtime,
      normalTravelMinutes: travelTotals.normal,
      overtimeTravelMinutes: travelTotals.overtime,
      normalMinutes: completionNormalMinutes,
      overtimeMinutes: completionOvertimeMinutes
    });
  }

  const users = Array.from(userMap.values());
  for (const u of users) {
    const dayKeys = Object.keys(u.days).sort();
    let firstAt: string | null = null;
    let lastAt: string | null = null;
    let completedCount = 0;
    let normalCompletedCount = 0;
    let overtimeCompletedCount = 0;
    let workMinutes = 0;
    let travelMinutes = 0;
    let normalMinutes = 0;
    let overtimeMinutes = 0;
    let normalWorkMinutes = 0;
    let overtimeWorkMinutes = 0;
    let normalTravelMinutes = 0;
    let overtimeTravelMinutes = 0;

    for (const k of dayKeys) {
      const d = u.days[k];
      d.totalMinutes = (d.workMinutes || 0) + (d.travelMinutes || 0);
      d.normalMinutes = (d.normalWorkMinutes || 0) + (d.normalTravelMinutes || 0);
      d.overtimeMinutes = (d.overtimeWorkMinutes || 0) + (d.overtimeTravelMinutes || 0);
      completedCount += d.completedCount;
      normalCompletedCount += d.normalCompletedCount;
      overtimeCompletedCount += d.overtimeCompletedCount;
      workMinutes += d.workMinutes;
      travelMinutes += d.travelMinutes;
      normalMinutes += d.normalMinutes;
      overtimeMinutes += d.overtimeMinutes;
      normalWorkMinutes += d.normalWorkMinutes;
      overtimeWorkMinutes += d.overtimeWorkMinutes;
      normalTravelMinutes += d.normalTravelMinutes;
      overtimeTravelMinutes += d.overtimeTravelMinutes;
      if (d.firstAt && (!firstAt || new Date(d.firstAt).getTime() < new Date(firstAt).getTime())) firstAt = d.firstAt;
      if (d.lastAt && (!lastAt || new Date(d.lastAt).getTime() > new Date(lastAt).getTime())) lastAt = d.lastAt;
    }

    u.total = {
      date: `${startYmd}..${endYmd}`,
      completedCount,
      normalCompletedCount,
      overtimeCompletedCount,
      workMinutes,
      travelMinutes,
      totalMinutes: workMinutes + travelMinutes,
      normalWorkMinutes,
      overtimeWorkMinutes,
      normalTravelMinutes,
      overtimeTravelMinutes,
      normalMinutes,
      overtimeMinutes,
      firstAt,
      lastAt
    };

    u.completions.sort((a, b) => {
      const at = a.completedAt || a.arrivedAt || a.departedAt || '';
      const bt = b.completedAt || b.arrivedAt || b.departedAt || '';
      return new Date(bt).getTime() - new Date(at).getTime();
    });
  }

  users.sort((a, b) => (b.total.totalMinutes || 0) - (a.total.totalMinutes || 0));
  return users;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type MesaiMode = 'normal' | 'overtime';
type RangePreset = 'month' | 'week' | 'today' | 'custom';

const MesaiTrackingPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => toYyyyMm(new Date()));
  const { monthStartYmd, monthEndYmd, monthLabel } = useMemo(() => {
    const { start, end } = monthBoundsFromYyyyMm(selectedMonth);
    return {
      monthStartYmd: toLocalYmd(start.toISOString()),
      monthEndYmd: toLocalYmd(end.toISOString()),
      monthLabel: formatMonthTr(selectedMonth)
    };
  }, [selectedMonth]);

  const [startYmd, setStartYmd] = useState<string>(monthStartYmd);
  const [endYmd, setEndYmd] = useState<string>(monthEndYmd);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [byUser, setByUser] = useState<MesaiUserSummary[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<MesaiMode>('normal');
  const [rangePreset, setRangePreset] = useState<RangePreset>('month');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStartYmd(monthStartYmd);
    setEndYmd(monthEndYmd);
    setRangePreset('month');
  }, [isOpen, selectedMonth, monthStartYmd, monthEndYmd]);

  const fetchReport = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      setLoading(true);
      if (!opts?.silent) setError(null);

      const startIso = startOfLocalDayIso(startYmd);
      const endIso = endOfLocalDayIso(endYmd);
      const res = await listWorkEntries({ startIso, endIso, limit: 5000 });
      if (!res.ok) {
        setError('Mesai verileri alınamadı');
        setByUser([]);
        return;
      }

      const filtered = res.rows.filter((r) => String(r.username || '').trim().length > 0);
      setByUser(computeMesaiFromWorkEntries(filtered, startYmd, endYmd));
    } catch (e) {
      console.warn('Mesai report exception', e);
      setError('Mesai raporu yüklenemedi');
      setByUser([]);
    } finally {
      setLoading(false);
    }
  }, [endYmd, startYmd]);

  useEffect(() => {
    if (!isOpen) return;
    fetchReport({ silent: true });
  }, [fetchReport, isOpen]);

  if (!isOpen) return null;

  const filteredUsers = byUser.filter(u => {
    if (!searchQuery.trim()) return true;
    return u.username.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const sumCompleted = byUser.reduce((s, u) => s + (u.total.completedCount || 0), 0);
  const sumModeCompleted = byUser.reduce(
    (s, u) => s + (mode === 'normal' ? (u.total.normalCompletedCount || 0) : (u.total.overtimeCompletedCount || 0)),
    0
  );
  const sumWork = byUser.reduce(
    (s, u) => s + (mode === 'normal' ? (u.total.normalWorkMinutes || 0) : (u.total.overtimeWorkMinutes || 0)),
    0
  );
  const sumTravel = byUser.reduce(
    (s, u) => s + (mode === 'normal' ? (u.total.normalTravelMinutes || 0) : (u.total.overtimeTravelMinutes || 0)),
    0
  );
  const sumTotal = byUser.reduce((s, u) => s + (mode === 'normal' ? (u.total.normalMinutes || 0) : (u.total.overtimeMinutes || 0)), 0);
  const sumGrandTotal = byUser.reduce((s, u) => s + (u.total.totalMinutes || 0), 0);

  const applyRange = (start: Date, end: Date, preset: RangePreset) => {
    const s = toIsoYmd(start);
    const e = toIsoYmd(end);
    setStartYmd(s);
    setEndYmd(e);
    setRangePreset(preset);
  };

  const applyToday = () => {
    const now = new Date();
    applyRange(now, now, 'today');
  };

  const applyThisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    applyRange(start, end, 'week');
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-gray-50">
      <div className="w-full h-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm safe-area-top">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25">
                <Timer className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">Mesai Takip</h1>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">{monthLabel}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => fetchReport()}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-700 transition-colors">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Stats Cards - Mobile First Grid */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            {/* Mobile: 2 rows, Desktop: 1 row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <div className="bg-white rounded-xl p-2.5 sm:p-3 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500 truncate">Tamamlanan</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-gray-800">{sumModeCompleted}</div>
                <div className="text-[9px] sm:text-[10px] text-gray-400">Genel: {sumCompleted}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-2.5 sm:p-3 border border-blue-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                  <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-blue-600 truncate">Çalışma</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-blue-700">{formatMinutes(sumWork)}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-2.5 sm:p-3 border border-purple-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                  <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-purple-600 truncate">Yol</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-purple-700">{formatMinutes(sumTravel)}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-2.5 sm:p-3 border border-amber-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-amber-600 truncate">{mode === 'normal' ? 'Normal' : 'Ek Mesai'}</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-amber-700">{formatMinutes(sumTotal)}</div>
              </div>
              <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-2.5 sm:p-3 border border-emerald-200 shadow-sm">
                <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-emerald-600 truncate">Toplam</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-emerald-700">{formatMinutes(sumGrandTotal)}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Date Range & Mode Selection */}
        <div className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 bg-white border-b border-gray-200 space-y-2 sm:space-y-3 overflow-x-hidden">
          {/* Month Navigation */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSelectedMonth((m) => shiftYyyyMm(m, -1))}
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-500 hover:text-gray-700 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="flex-1 relative min-w-0">
              <Calendar className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value || toYyyyMm(new Date()))}
                className="w-full pl-8 sm:pl-10 pr-2 sm:pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 text-xs sm:text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>
            <button
              onClick={() => setSelectedMonth((m) => shiftYyyyMm(m, 1))}
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-500 hover:text-gray-700 transition-colors shrink-0"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Date Range Inputs */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="relative">
              <span className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs text-gray-500 pointer-events-none">Baş</span>
              <input
                type="date"
                value={startYmd}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartYmd(v);
                  if (endYmd && v > endYmd) setEndYmd(v);
                  setRangePreset('custom');
                }}
                className="w-full pl-9 sm:pl-14 pr-1 sm:pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 text-xs sm:text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>
            <div className="relative">
              <span className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs text-gray-500 pointer-events-none">Bit</span>
              <input
                type="date"
                value={endYmd}
                onChange={(e) => {
                  const v = e.target.value;
                  setEndYmd(v);
                  if (startYmd && v < startYmd) setStartYmd(v);
                  setRangePreset('custom');
                }}
                className="w-full pl-8 sm:pl-12 pr-1 sm:pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 text-xs sm:text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>
          </div>

          {/* Quick Range Buttons & Mode Toggle - Redesigned for mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* First row on mobile: range presets + fetch button */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 shrink-0">
                {([  
                  { key: 'month', label: 'Ay', action: () => { setStartYmd(monthStartYmd); setEndYmd(monthEndYmd); setRangePreset('month'); } },
                  { key: 'week', label: 'Hafta', action: applyThisWeek },
                  { key: 'today', label: 'Bugün', action: applyToday }
                ] as { key: RangePreset; label: string; action: () => void }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={f.action}
                    className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors ${
                      rangePreset === f.key 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => fetchReport()}
                disabled={loading}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 shadow-sm"
              >
                {loading ? <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <Play className="w-3 h-3 sm:w-4 sm:h-4" />}
                <span className="hidden xs:inline">Raporu</span> Getir
              </button>
            </div>

            <div className="flex-1 hidden sm:block" />

            {/* Mode toggle */}
            <div className="flex rounded-lg sm:rounded-xl overflow-hidden border border-gray-200 self-start sm:self-auto">
              <button
                onClick={() => setMode('normal')}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors flex items-center gap-1 sm:gap-1.5 ${
                  mode === 'normal' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                Normal
              </button>
              <button
                onClick={() => setMode('overtime')}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium transition-colors flex items-center gap-1 sm:gap-1.5 ${
                  mode === 'overtime' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                Ek Mesai
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Kullanıcı ara..."
              className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl text-gray-800 placeholder-gray-400 text-xs sm:text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
          </div>

          {/* Schedule Info - Compact on mobile */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-xs text-gray-500 bg-gray-100 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2">
            <Coffee className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">H.İçi 09-18, Cmt 09-14, Pzr = Ek mesai</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 overflow-x-hidden">
          {error && (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl mb-3 sm:mb-4 shadow-sm">
                <X className="w-10 h-10 sm:w-12 sm:h-12 text-red-500" />
              </div>
              <p className="text-red-600 font-medium mb-3 sm:mb-4 text-sm sm:text-base text-center px-4">{error}</p>
              <button onClick={() => fetchReport()} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium hover:bg-gray-50 shadow-sm transition-all">
                Tekrar Dene
              </button>
            </div>
          )}

          {!error && loading && byUser.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
                <RefreshCw className="relative w-10 h-10 sm:w-12 sm:h-12 animate-spin text-blue-600" />
              </div>
              <p className="text-gray-500 mt-4 text-sm sm:text-base">Mesai raporu yükleniyor...</p>
            </div>
          )}

          {!error && !loading && byUser.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16">
              <div className="p-3 sm:p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl mb-3 sm:mb-4 shadow-sm">
                <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-600 text-center">Bu tarih aralığında kayıt yok</p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">Farklı bir tarih aralığı seçin</p>
            </div>
          )}

          {!error && filteredUsers.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              {filteredUsers.map((u) => {
                const isOpenUser = !!expanded[u.username];
                const label = mode === 'normal' ? 'Normal' : 'Ek';
                const modeWork = mode === 'normal' ? (u.total.normalWorkMinutes || 0) : (u.total.overtimeWorkMinutes || 0);
                const modeTravel = mode === 'normal' ? (u.total.normalTravelMinutes || 0) : (u.total.overtimeTravelMinutes || 0);
                const modeTotal = mode === 'normal' ? (u.total.normalMinutes || 0) : (u.total.overtimeMinutes || 0);
                const modeCompleted = mode === 'normal' ? (u.total.normalCompletedCount || 0) : (u.total.overtimeCompletedCount || 0);
                const dayKeys = Object.keys(u.days)
                  .filter((k) => {
                    const d = u.days[k];
                    const m = mode === 'normal' ? (d.normalMinutes || 0) : (d.overtimeMinutes || 0);
                    const c = mode === 'normal' ? (d.normalCompletedCount || 0) : (d.overtimeCompletedCount || 0);
                    return (m || 0) > 0 || (c || 0) > 0;
                  })
                  .sort()
                  .reverse();

                const visibleCompletions = u.completions.filter((c) => {
                  const m = mode === 'normal' ? (c.normalMinutes || 0) : (c.overtimeMinutes || 0);
                  return (m || 0) > 0;
                });

                const progressPercent = u.total.totalMinutes > 0 ? (modeTotal / u.total.totalMinutes) * 100 : 0;

                return (
                  <div key={u.username} className="bg-white border border-gray-200 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    {/* User Header */}
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => ({ ...prev, [u.username]: !isOpenUser }))}
                      className="w-full p-3 sm:p-4 flex items-center gap-2.5 sm:gap-4 hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Avatar */}
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0 shadow-sm ${
                        mode === 'normal' 
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
                          : 'bg-gradient-to-br from-purple-500 to-purple-600'
                      }`}>
                        {String(u.username).slice(0, 1).toUpperCase()}
                      </div>

                      {/* User Info */}
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                          <h3 className="font-semibold text-gray-800 truncate text-sm sm:text-base">{u.username}</h3>
                          <span className={`px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide rounded-full shrink-0 ${
                            mode === 'normal' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                          }`}>
                            {modeCompleted} {label}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-gray-500">
                          <span className="flex items-center gap-0.5 sm:gap-1">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            {u.total.firstAt ? formatTime(u.total.firstAt) : '--:--'} - {u.total.lastAt ? formatTime(u.total.lastAt) : '--:--'}
                          </span>
                          <span className="flex items-center gap-0.5 sm:gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-500" />
                            {u.total.completedCount} toplam
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-1.5 sm:mt-2 h-1 sm:h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              mode === 'normal' ? 'bg-gradient-to-r from-blue-400 to-blue-500' : 'bg-gradient-to-r from-purple-400 to-purple-500'
                            }`}
                            style={{ width: `${Math.min(progressPercent, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Time Display */}
                      <div className="shrink-0 text-right">
                        <div className={`text-base sm:text-lg font-bold ${mode === 'normal' ? 'text-blue-600' : 'text-purple-600'}`}>
                          {formatMinutes(modeTotal)}
                        </div>
                        <div className="text-[9px] sm:text-xs text-gray-500 whitespace-nowrap">
                          <span className="hidden xs:inline">İş: {formatMinutes(modeWork)} • Yol: {formatMinutes(modeTravel)}</span>
                          <span className="xs:hidden">{formatMinutes(modeWork)}/{formatMinutes(modeTravel)}</span>
                        </div>
                      </div>

                      <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform shrink-0 ${isOpenUser ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Expanded Content */}
                    {isOpenUser && (
                      <div className="px-2.5 sm:px-4 pb-3 sm:pb-4 border-t border-gray-100">
                        {/* Quick Stats - 2x2 grid on mobile, 4 cols on larger */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 pt-3 sm:pt-4 mb-3 sm:mb-4">
                          <div className={`rounded-lg sm:rounded-xl p-2 sm:p-3 ${mode === 'normal' ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/60' : 'bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200/60'}`}>
                            <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">{label} Çalışma</div>
                            <div className={`text-sm sm:text-lg font-bold ${mode === 'normal' ? 'text-blue-700' : 'text-purple-700'}`}>{formatMinutes(modeWork)}</div>
                          </div>
                          <div className={`rounded-lg sm:rounded-xl p-2 sm:p-3 ${mode === 'normal' ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/60' : 'bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200/60'}`}>
                            <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">{label} Yol</div>
                            <div className={`text-sm sm:text-lg font-bold ${mode === 'normal' ? 'text-blue-700' : 'text-purple-700'}`}>{formatMinutes(modeTravel)}</div>
                          </div>
                          <div className={`rounded-lg sm:rounded-xl p-2 sm:p-3 ${mode === 'normal' ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200/60' : 'bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200/60'}`}>
                            <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">{label} Toplam</div>
                            <div className={`text-sm sm:text-lg font-bold ${mode === 'normal' ? 'text-blue-700' : 'text-purple-700'}`}>{formatMinutes(modeTotal)}</div>
                          </div>
                          <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-green-200/60">
                            <div className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500">Genel Toplam</div>
                            <div className="text-sm sm:text-lg font-bold text-green-700">{formatMinutes(u.total.totalMinutes)}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-4">
                          {/* Daily Breakdown */}
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2.5 sm:p-4 border border-gray-200/60">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <h4 className="text-xs sm:text-sm font-semibold text-gray-800 flex items-center gap-1.5 sm:gap-2">
                                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                                Günlük Kırılım
                              </h4>
                              <span className="text-[9px] sm:text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded">{dayKeys.length} gün</span>
                            </div>
                            <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto pr-0.5 sm:pr-1">
                              {dayKeys.map((k) => {
                                const d = u.days[k];
                                const dayWork = mode === 'normal' ? (d.normalWorkMinutes || 0) : (d.overtimeWorkMinutes || 0);
                                const dayTravel = mode === 'normal' ? (d.normalTravelMinutes || 0) : (d.overtimeTravelMinutes || 0);
                                const dayTotal = mode === 'normal' ? (d.normalMinutes || 0) : (d.overtimeMinutes || 0);
                                const dayCompleted = mode === 'normal' ? (d.normalCompletedCount || 0) : (d.overtimeCompletedCount || 0);
                                return (
                                  <div key={k} className="flex items-center justify-between gap-2 sm:gap-3 bg-white rounded-lg sm:rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200/80 shadow-sm">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs sm:text-sm font-medium text-gray-800">{k}</div>
                                      <div className="flex items-center gap-1 sm:gap-2 mt-0.5 text-[9px] sm:text-xs text-gray-500 flex-wrap">
                                        <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-medium shrink-0 ${
                                          mode === 'normal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                        }`}>
                                          {dayCompleted} iş
                                        </span>
                                        <span className="hidden xs:inline">İş: {formatMinutes(dayWork)}</span>
                                        <span className="hidden xs:inline">Yol: {formatMinutes(dayTravel)}</span>
                                        <span className="xs:hidden">{formatMinutes(dayWork)}/{formatMinutes(dayTravel)}</span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className={`text-xs sm:text-sm font-bold ${mode === 'normal' ? 'text-blue-700' : 'text-purple-700'}`}>
                                        {formatMinutes(dayTotal)}
                                      </div>
                                      <div className="text-[8px] sm:text-[10px] text-gray-500">/ {formatMinutes(d.totalMinutes)}</div>
                                    </div>
                                  </div>
                                );
                              })}
                              {dayKeys.length === 0 && (
                                <div className="text-center py-4 sm:py-6 text-xs sm:text-sm text-gray-500">
                                  Bu modda kayıt yok
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Completed Works */}
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-lg sm:rounded-xl p-2.5 sm:p-4 border border-gray-200/60">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <h4 className="text-xs sm:text-sm font-semibold text-gray-800 flex items-center gap-1.5 sm:gap-2">
                                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                                Tamamlanan İşler
                              </h4>
                              <span className="text-[9px] sm:text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded">{visibleCompletions.length} kayıt</span>
                            </div>
                            <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto pr-0.5 sm:pr-1">
                              {visibleCompletions.slice(0, 100).map((c, idx) => (
                                <div
                                  key={`${c.date}-${c.locationName}-${idx}`}
                                  className="bg-white rounded-lg sm:rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200/80 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs sm:text-sm font-medium text-gray-800 truncate">{c.locationName}</div>
                                      <div className="flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-0.5 sm:gap-y-1 mt-0.5 sm:mt-1 text-[8px] sm:text-[10px] text-gray-500">
                                        <span className="px-1 sm:px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c.date}</span>
                                        <span className="hidden sm:inline">Çıkış: {c.departedAt ? formatTime(c.departedAt) : '--:--'}</span>
                                        <span className="hidden sm:inline">Varış: {c.arrivedAt ? formatTime(c.arrivedAt) : '--:--'}</span>
                                        <span className="hidden sm:inline">Bitiş: {c.completedAt ? formatTime(c.completedAt) : '--:--'}</span>
                                        <span className="sm:hidden">{c.departedAt ? formatTime(c.departedAt) : '--'}→{c.completedAt ? formatTime(c.completedAt) : '--'}</span>
                                      </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold ${
                                        mode === 'normal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                      }`}>
                                        {formatMinutes(mode === 'normal' ? (c.normalMinutes || 0) : (c.overtimeMinutes || 0))}
                                      </div>
                                      <div className="text-[8px] sm:text-[10px] text-gray-500 mt-0.5 sm:mt-1 hidden sm:block">
                                        İş: {formatMinutes(mode === 'normal' ? (c.normalWorkMinutes || 0) : (c.overtimeWorkMinutes || 0))} • Yol: {formatMinutes(mode === 'normal' ? (c.normalTravelMinutes || 0) : (c.overtimeTravelMinutes || 0))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {visibleCompletions.length === 0 && (
                                <div className="text-center py-4 sm:py-6 text-xs sm:text-sm text-gray-500">
                                  Bu modda kayıt yok
                                </div>
                              )}
                            </div>
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
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {byUser.length} kullanıcı
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium ${
              mode === 'normal' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
            }`}>
              {mode === 'normal' ? 'Normal mesai' : 'Ek mesai'}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default MesaiTrackingPanel;
