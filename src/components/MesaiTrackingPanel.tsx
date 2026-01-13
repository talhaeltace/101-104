import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Calendar, ChevronDown, ChevronUp, RefreshCw, Timer, X } from 'lucide-react';
import { listWorkEntries, type WorkEntryRow } from '../lib/workEntries';
import { formatDuration as formatMinutes } from '../lib/teamStatus';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

type MesaiDaySummary = {
  date: string; // YYYY-MM-DD (local)
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

// Fixed mesai schedule:
// - Weekdays (Mon-Fri): 09:00-18:00
// - Saturday: 09:00-14:00
// - Sunday: no normal hours (everything is overtime)
const getNormalIntervalsForLocalDate = (d: Date): Array<[number, number]> => {
  const day = d.getDay();
  if (day === 0) return []; // Sunday
  if (day === 6) return [[9 * 60, 14 * 60]]; // Saturday
  return [[9 * 60, 18 * 60]]; // Mon-Fri
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

    // Per-completion allocation totals so the UI can show ONLY normal or ONLY overtime items.
    // This avoids confusing mixed lists ("ek" view showing normal-only items, etc.).
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

    // Travel allocation (departed -> arrived)
    // Use timestamp window primarily (more reliable than stored minutes), but keep stored minutes for display.
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

    // Work allocation (arrived -> completed)
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

    // Completion count attributed to completion day.
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

  useEffect(() => {
    if (!isOpen) return;
    setStartYmd(monthStartYmd);
    setEndYmd(monthEndYmd);
    setRangePreset('month');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedMonth, monthStartYmd, monthEndYmd]);

  const fetchReport = async (opts?: { silent?: boolean }) => {
    try {
      setLoading(true);
      if (!opts?.silent) setError(null);

      const startIso = startOfLocalDayIso(startYmd);
      const endIso = endOfLocalDayIso(endYmd);
      const res = await listWorkEntries({ startIso, endIso, limit: 5000 });
      if (!res.ok) {
        setError('Mesai tablosu bulunamadı veya erişilemedi (work_entries). Supabase migration çalıştırılmalı.');
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
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchReport({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

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
    const diffToMonday = (day + 6) % 7; // Mon=0..Sun=6
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    applyRange(start, end, 'week');
  };

  return (
    <div className="fixed inset-0 z-[1400] bg-black/40">
      <div className="bg-white w-full h-full flex flex-col overflow-hidden overscroll-contain">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-white/20 rounded-xl">
              <Timer className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg sm:text-xl">Mesai Takip</h2>
              <p className="text-xs sm:text-sm text-white/80">{monthLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchReport()}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-gray-50">
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] items-end gap-3">
                  <div className="w-full lg:w-auto">
                    <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth((m) => shiftYyyyMm(m, -1))}
                      className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                      title="Önceki ay"
                    >
                      <ArrowLeft className="w-4 h-4 text-gray-700" />
                    </button>

                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Ay</div>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value || toYyyyMm(new Date()))}
                        className="mt-1 h-10 w-full px-3 rounded-lg bg-white text-gray-900 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedMonth((m) => shiftYyyyMm(m, 1))}
                      className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                      title="Sonraki ay"
                    >
                      <ArrowRight className="w-4 h-4 text-gray-700" />
                    </button>
                    </div>
                  </div>

                  <div className="w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto] items-end gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-gray-500">Başlangıç</div>
                        <div className="mt-1 flex items-center gap-2 h-10 px-3 border border-gray-200 rounded-lg bg-white">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <input
                            type="date"
                            value={startYmd}
                            onChange={(e) => {
                              const v = e.target.value;
                              setStartYmd(v);
                              if (endYmd && v > endYmd) setEndYmd(v);
                              setRangePreset('custom');
                            }}
                            className="text-sm bg-transparent focus:outline-none w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500">Bitiş</div>
                        <div className="mt-1 flex items-center gap-2 h-10 px-3 border border-gray-200 rounded-lg bg-white">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <input
                            type="date"
                            value={endYmd}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEndYmd(v);
                              if (startYmd && v < startYmd) setStartYmd(v);
                              setRangePreset('custom');
                            }}
                            className="text-sm bg-transparent focus:outline-none w-full"
                          />
                        </div>
                      </div>
                    </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 w-full lg:w-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setStartYmd(monthStartYmd);
                            setEndYmd(monthEndYmd);
                            setRangePreset('month');
                          }}
                          className={`h-10 w-full px-3 rounded-lg border text-sm hover:bg-gray-50 transition-colors ${
                            rangePreset === 'month' ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800' : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          Seçili ay
                        </button>
                        <button
                          type="button"
                          onClick={applyThisWeek}
                          className={`h-10 w-full px-3 rounded-lg border text-sm hover:bg-gray-50 transition-colors ${
                            rangePreset === 'week' ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800' : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          Bu hafta
                        </button>
                        <button
                          type="button"
                          onClick={applyToday}
                          className={`h-10 w-full px-3 rounded-lg border text-sm hover:bg-gray-50 transition-colors ${
                            rangePreset === 'today' ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800' : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          Bugün
                        </button>
                        <button
                          type="button"
                          onClick={() => fetchReport()}
                          className="h-10 w-full px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 disabled:hover:bg-gray-900 col-span-3 sm:col-span-1"
                          disabled={loading}
                        >
                          {loading ? 'Yükleniyor…' : 'Raporu Getir'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm w-fit">
                    <button
                      type="button"
                      onClick={() => setMode('normal')}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        mode === 'normal' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-700 hover:bg-white'
                      }`}
                    >
                      Normal Mesai
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('overtime')}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        mode === 'overtime' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-700 hover:bg-white'
                      }`}
                    >
                      Ek Mesai
                    </button>
                  </div>

                  <div className="text-xs text-gray-500">
                    Kural: Hafta içi 09:00–18:00, Cumartesi 09:00–14:00, Pazar normal mesai yok (tamamı ek mesai).
                  </div>
                </div>
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            {!error && !loading && byUser.length === 0 && (
              <div className="text-sm text-gray-500">Bu tarih aralığında kayıt bulunamadı.</div>
            )}

            {!error && byUser.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{mode === 'normal' ? 'Normal Tamamlanan' : 'Ek Mesai Tamamlanan'}</div>
                    <div className="text-sm font-bold text-gray-900">{sumModeCompleted}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Genel: {sumCompleted}</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{mode === 'normal' ? 'Normal Çalışma' : 'Ek Çalışma'}</div>
                    <div className="text-sm font-bold text-gray-900">{formatMinutes(sumWork)}</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{mode === 'normal' ? 'Normal Yol' : 'Ek Yol'}</div>
                    <div className="text-sm font-bold text-gray-900">{formatMinutes(sumTravel)}</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{mode === 'normal' ? 'Normal Toplam' : 'Ek Toplam'}</div>
                    <div className="text-sm font-bold text-gray-900">{formatMinutes(sumTotal)}</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Genel Toplam</div>
                    <div className="text-sm font-bold text-gray-900">{formatMinutes(sumGrandTotal)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {byUser.map((u) => {
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

                    return (
                      <div key={u.username} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [u.username]: !isOpenUser }))}
                          aria-expanded={isOpenUser}
                          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                              {String(u.username).slice(0, 1).toUpperCase()}
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-semibold text-gray-900">{u.username}</div>
                              <div className="text-xs text-gray-500">
                                {u.total.firstAt ? formatTime(u.total.firstAt) : '--:--'} - {u.total.lastAt ? formatTime(u.total.lastAt) : '--:--'} • {label} tamamlanan: {modeCompleted} • Genel: {u.total.completedCount}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-900">{label}: {formatMinutes(modeTotal)}</div>
                              <div className="text-xs text-gray-500">İş: {formatMinutes(modeWork)} • Yol: {formatMinutes(modeTravel)}</div>
                            </div>
                            {isOpenUser ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                          </div>
                        </button>

                        {isOpenUser && (
                          <div className="px-4 pb-4 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <div className="text-[11px] text-gray-500">{label} Çalışma</div>
                                <div className="text-base font-bold text-gray-900">{formatMinutes(modeWork)}</div>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <div className="text-[11px] text-gray-500">{label} Yol</div>
                                <div className="text-base font-bold text-gray-900">{formatMinutes(modeTravel)}</div>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <div className="text-[11px] text-gray-500">{label} Toplam</div>
                                <div className="text-base font-bold text-gray-900">{formatMinutes(modeTotal)}</div>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                <div className="text-[11px] text-gray-500">Genel Toplam</div>
                                <div className="text-base font-bold text-gray-900">{formatMinutes(u.total.totalMinutes)}</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div className="bg-white border border-gray-200 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-semibold text-gray-700">Günlük kırılım</div>
                                  <div className="text-[11px] text-gray-500">Sadece {label.toLowerCase()} mesai görünen günler</div>
                                </div>
                                <div className="space-y-2">
                                  {dayKeys.map((k) => {
                                    const d = u.days[k];
                                    const dayWork = mode === 'normal' ? (d.normalWorkMinutes || 0) : (d.overtimeWorkMinutes || 0);
                                    const dayTravel = mode === 'normal' ? (d.normalTravelMinutes || 0) : (d.overtimeTravelMinutes || 0);
                                    const dayTotal = mode === 'normal' ? (d.normalMinutes || 0) : (d.overtimeMinutes || 0);
                                    const dayCompleted = mode === 'normal' ? (d.normalCompletedCount || 0) : (d.overtimeCompletedCount || 0);
                                    return (
                                      <div key={k} className="flex items-start justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-gray-900">{k}</div>
                                          <div className="text-xs text-gray-600 mt-0.5">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-gray-200 mr-2">
                                              {dayCompleted} tamamlanan
                                            </span>
                                            <span>{label} İş {formatMinutes(dayWork)}</span>
                                            <span className="text-gray-300"> • </span>
                                            <span>{label} Yol {formatMinutes(dayTravel)}</span>
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="text-sm font-bold text-gray-900">{formatMinutes(dayTotal)}</div>
                                          <div className="text-[11px] text-gray-500">Genel: {formatMinutes(d.totalMinutes)}</div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="bg-white border border-gray-200 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-semibold text-gray-700">Tamamlanan işler</div>
                                  <div className="text-[11px] text-gray-500">Sadece {label.toLowerCase()} dakika olanlar</div>
                                </div>
                                <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
                                  {visibleCompletions.slice(0, 200).map((c, idx) => (
                                    <div
                                      key={`${c.date}-${c.locationName}-${idx}`}
                                      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2"
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="text-gray-900 font-semibold truncate">{c.locationName}</div>
                                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-gray-200">{c.date}</span>
                                            <span>Çıkış {c.departedAt ? formatTime(c.departedAt) : '--:--'}</span>
                                            <span className="text-gray-300">•</span>
                                            <span>Varış {c.arrivedAt ? formatTime(c.arrivedAt) : '--:--'}</span>
                                            <span className="text-gray-300">•</span>
                                            <span>Bitiş {c.completedAt ? formatTime(c.completedAt) : '--:--'}</span>
                                          </div>
                                        </div>

                                        <div className="text-left sm:text-right shrink-0">
                                          <div className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold">
                                            {label} {formatMinutes(mode === 'normal' ? (c.normalMinutes || 0) : (c.overtimeMinutes || 0))}
                                          </div>
                                          <div className="text-xs text-gray-600 mt-1">
                                            İş {formatMinutes(mode === 'normal' ? (c.normalWorkMinutes || 0) : (c.overtimeWorkMinutes || 0))}
                                            <span className="text-gray-300"> • </span>
                                            Yol {formatMinutes(mode === 'normal' ? (c.normalTravelMinutes || 0) : (c.overtimeTravelMinutes || 0))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {visibleCompletions.length === 0 && (
                                    <div className="text-sm text-gray-500">Bu kullanıcıda seçili mod için kayıt yok.</div>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MesaiTrackingPanel;
