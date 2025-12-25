import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Users, MapPin, Navigation, CheckCircle2, Clock, X, RefreshCw, ChevronRight, Activity, Car, Briefcase, Timer, TrendingUp, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDuration as formatMinutes } from '../lib/teamStatus';
import type { Region } from '../data/regions';
import { createTask, type Task } from '../lib/tasks';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

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
  onFocusMember?: (memberId: string, username: string, lat: number, lng: number) => void;
  currentUserId: string | null;
  currentUsername: string | null;
  isAdmin?: boolean;
  regions: Region[];
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

type ActivityRow = {
  id: string;
  username: string;
  action: string;
  location_id: string | null;
  location_name: string | null;
  arrival_time: string | null;
  completion_time: string | null;
  duration_minutes: number | null;
  activity_type: 'arrival' | 'completion' | 'general' | string;
  created_at: string;
};

type MesaiDaySummary = {
  date: string; // YYYY-MM-DD (local)
  completedCount: number;
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

const normalizeUsername = (name: string | null | undefined) => {
  const s = String(name || '').trim();
  return s ? s.toLocaleLowerCase('tr-TR') : '';
};

const monthBoundsFromYyyyMm = (yyyyMm: string) => {
  // Guard against empty/invalid values (e.g. browser month input clear button).
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
    if (e > s) sum += (e - s);
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

const TeamPanel: React.FC<Props> = ({ isOpen, onClose, onFocusMember, currentUserId, currentUsername, isAdmin = false, regions }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMemberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useBodyScrollLock(isOpen);

  const panelRef = useRef<HTMLDivElement>(null);
  const teamMembersRef = useRef<TeamMemberStatus[]>([]);

  // Admin mesai report state
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toYyyyMm(new Date()));
  const { monthStartYmd, monthEndYmd, monthLabel } = useMemo(() => {
    const { start, end } = monthBoundsFromYyyyMm(selectedMonth);
    return {
      monthStartYmd: toLocalYmd(start.toISOString()),
      monthEndYmd: toLocalYmd(end.toISOString()),
      monthLabel: formatMonthTr(selectedMonth)
    };
  }, [selectedMonth]);

  const [mesaiOpen, setMesaiOpen] = useState<boolean>(false);
  const [mesaiStart, setMesaiStart] = useState<string>(monthStartYmd);
  const [mesaiEnd, setMesaiEnd] = useState<string>(monthEndYmd);
  const [mesaiLoading, setMesaiLoading] = useState<boolean>(false);
  const [mesaiError, setMesaiError] = useState<string | null>(null);
  const [mesaiByUser, setMesaiByUser] = useState<MesaiUserSummary[]>([]);
  const [mesaiExpanded, setMesaiExpanded] = useState<Record<string, boolean>>({});

  // Month-accurate "Bu ay" totals computed from activities.
  const [monthTotals, setMonthTotals] = useState<{ completed: number; workMinutes: number; travelMinutes: number } | null>(null);
  const [monthByUser, setMonthByUser] = useState<Record<string, { completed: number; workMinutes: number; travelMinutes: number }>>({});

  // Mesai report should show only editors (preferred) or at least current team members.
  // If we can't load roles, fall back to team_status usernames.
  const [editorUsernames, setEditorUsernames] = useState<string[] | null>(null);

  const allowedUserSet = useMemo(() => {
    if (editorUsernames) return new Set(editorUsernames);
    const s = new Set<string>();
    for (const m of teamMembers) {
      const k = normalizeUsername(m.username);
      if (k) s.add(k);
    }
    return s;
  }, [editorUsernames, teamMembers]);

  useEffect(() => {
    teamMembersRef.current = teamMembers;
  }, [teamMembers]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isAdmin) return;

    const run = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('app_users')
          .select('username, role')
          .eq('role', 'editor')
          .limit(1000);

        if (fetchError) {
          console.warn('editor users fetch error', fetchError);
          setEditorUsernames(null);
          return;
        }

        const list = (data || [])
          .map((u: any) => normalizeUsername(u.username))
          .filter(Boolean);
        setEditorUsernames(list);
      } catch (e) {
        console.warn('editor users fetch exception', e);
        setEditorUsernames(null);
      }
    };

    run();
  }, [isOpen, isAdmin]);

  // Keep Mesai Raporu default range aligned with selected month unless the panel is open
  useEffect(() => {
    if (!isOpen) return;
    if (mesaiOpen) return;
    setMesaiStart(monthStartYmd);
    setMesaiEnd(monthEndYmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedMonth, monthStartYmd, monthEndYmd]);

  const [memberCurrentTask, setMemberCurrentTask] = useState<Record<string, Task | null>>({});

  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(false);
  const [taskDetailsMember, setTaskDetailsMember] = useState<TeamMemberStatus | null>(null);
  const [taskDetailsTask, setTaskDetailsTask] = useState<Task | null>(null);

  // Task assignment modal state
  const [isAssignTaskModalOpen, setIsAssignTaskModalOpen] = useState(false);
  const [taskMember, setTaskMember] = useState<TeamMemberStatus | null>(null);
  const [taskRegionId, setTaskRegionId] = useState<number>(0);
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [taskSearch, setTaskSearch] = useState<string>('');
  const [selectedTaskLocationIds, setSelectedTaskLocationIds] = useState<string[]>([]);
  const [assigningTask, setAssigningTask] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

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

  const computeMesaiFromActivities = (rows: ActivityRow[], startYmd: string, endYmd: string): MesaiUserSummary[] => {
    const userMap = new Map<string, MesaiUserSummary>();

    // Build an index of arrival events so we can show travel (yol) per completed location.
    // Key by normalized username + location_id + arrival timestamp.
    const arrivalExact = new Map<string, { travelMinutes: number; departedAt: string; arrivedAt: string }>();
    const arrivalByLoc = new Map<string, Array<{ arrivedAtMs: number; travelMinutes: number; departedAt: string; arrivedAt: string }>>();
    for (const r of rows) {
      if (r.activity_type !== 'arrival') continue;
      const mins = Number(r.duration_minutes || 0);
      if (!(mins > 0)) continue;
      const arrivedAt = r.arrival_time || r.created_at;
      if (!arrivedAt) continue;
      const uKey = normalizeUsername(r.username);
      const locKey = String(r.location_id || '');
      if (!uKey || !locKey) continue;
      const arrivedAtMs = new Date(arrivedAt).getTime();
      if (!Number.isFinite(arrivedAtMs)) continue;
      const departedAt = new Date(arrivedAtMs - mins * 60000).toISOString();
      const exactKey = `${uKey}|${locKey}|${arrivedAt}`;
      arrivalExact.set(exactKey, { travelMinutes: mins, departedAt, arrivedAt });

      const bucketKey = `${uKey}|${locKey}`;
      const list = arrivalByLoc.get(bucketKey) || [];
      list.push({ arrivedAtMs, travelMinutes: mins, departedAt, arrivedAt });
      arrivalByLoc.set(bucketKey, list);
    }

    for (const [k, list] of arrivalByLoc.entries()) {
      list.sort((a, b) => a.arrivedAtMs - b.arrivedAtMs);
      arrivalByLoc.set(k, list);
    }
    const ensureUser = (username: string) => {
      const norm = normalizeUsername(username);
      const key = norm || 'bilinmeyen';
      let u = userMap.get(key);
      if (!u) {
        const emptyTotal: MesaiDaySummary = {
          date: `${startYmd}..${endYmd}`,
          completedCount: 0,
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
        // Keep display username, but key by normalized username.
        u = { username: username || key, days: {}, total: emptyTotal, completions: [] };
        userMap.set(key, u);
      }
      return u;
    };

    const ensureDay = (u: MesaiUserSummary, date: string) => {
      let d = u.days[date];
      if (!d) {
        d = {
          date,
          completedCount: 0,
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

      // Work minutes from completion events (split by mesai schedule)
      if (r.activity_type === 'completion') {
        const mins = Number(r.duration_minutes || 0);
        const endIso = r.completion_time || r.created_at;
        const end = new Date(endIso);

        // Try to use arrival_time as start; otherwise infer start from end - duration.
        const startIso = r.arrival_time || (mins > 0 ? new Date(end.getTime() - mins * 60000).toISOString() : endIso);

        const alloc = allocateMinutesBySchedule(startIso, endIso);
        for (const [ymd, a] of alloc.entries()) {
          const day = ensureDay(u, ymd);
          day.workMinutes += a.total;
          day.normalWorkMinutes += a.normal;
          day.overtimeWorkMinutes += a.overtime;
          bumpWindow(day, startIso);
          bumpWindow(day, endIso);
        }

        // Completion count should be attributed to completion day.
        const completionDay = toLocalYmd(endIso);
        ensureDay(u, completionDay).completedCount += 1;

        // Travel lookup (yola çıkış / varış / yol süresi)
        const uKey = normalizeUsername(r.username);
        const locKey = String(r.location_id || '');
        const arrivedAt = r.arrival_time || null;
        let travelMinutes = 0;
        let departedAt: string | null = null;
        if (uKey && locKey && arrivedAt) {
          const exactKey = `${uKey}|${locKey}|${arrivedAt}`;
          const exact = arrivalExact.get(exactKey);
          if (exact) {
            travelMinutes = exact.travelMinutes;
            departedAt = exact.departedAt;
          } else {
            // Fallback: match closest arrival within 2 minutes (timestamp precision differences)
            const bucketKey = `${uKey}|${locKey}`;
            const list = arrivalByLoc.get(bucketKey) || [];
            const targetMs = new Date(arrivedAt).getTime();
            if (Number.isFinite(targetMs) && list.length > 0) {
              let best: typeof list[number] | null = null;
              let bestDiff = Infinity;
              for (const a of list) {
                const diff = Math.abs(a.arrivedAtMs - targetMs);
                if (diff < bestDiff) {
                  bestDiff = diff;
                  best = a;
                }
              }
              if (best && bestDiff <= 2 * 60 * 1000) {
                travelMinutes = best.travelMinutes;
                departedAt = best.departedAt;
              }
            }
          }
        }

        u.completions.push({
          date: completionDay,
          locationName: r.location_name || 'Lokasyon',
          departedAt,
          arrivedAt,
          completedAt: r.completion_time || r.created_at,
          travelMinutes,
          workMinutes: mins
        });
        continue;
      }

      // Travel minutes from arrival events (duration_minutes is travel minutes, ending at arrival_time)
      if (r.activity_type === 'arrival') {
        const mins = Number(r.duration_minutes || 0);
        const endIso = r.arrival_time || r.created_at;
        if (mins > 0 && endIso) {
          const end = new Date(endIso);
          const startIso = new Date(end.getTime() - mins * 60000).toISOString();
          const alloc = allocateMinutesBySchedule(startIso, endIso);
          for (const [ymd, a] of alloc.entries()) {
            const day = ensureDay(u, ymd);
            day.travelMinutes += a.total;
            day.normalTravelMinutes += a.normal;
            day.overtimeTravelMinutes += a.overtime;
            bumpWindow(day, startIso);
            bumpWindow(day, endIso);
          }
          continue;
        }

        // If we don't have minutes, still update the window for that day.
        const stamp = r.created_at || r.arrival_time;
        if (stamp) bumpWindow(ensureDay(u, toLocalYmd(stamp)), stamp);
        continue;
      }

      // General events still affect first/last time window
      const stamp = r.created_at;
      if (stamp) bumpWindow(ensureDay(u, toLocalYmd(stamp)), stamp);
    }

    const users = Array.from(userMap.values());
    // roll up totals per user
    for (const u of users) {
      const dayKeys = Object.keys(u.days).sort();
      let firstAt: string | null = null;
      let lastAt: string | null = null;
      let completedCount = 0;
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
      // Sort completions newest first for quick audit
      u.completions.sort((a, b) => {
        const at = a.completedAt || a.arrivedAt || a.departedAt || '';
        const bt = b.completedAt || b.arrivedAt || b.departedAt || '';
        return new Date(bt).getTime() - new Date(at).getTime();
      });
    }

    // Sort users by total minutes desc
    users.sort((a, b) => (b.total.totalMinutes || 0) - (a.total.totalMinutes || 0));
    return users;
  };

  const fetchMesaiReport = async () => {
    if (!isAdmin) return;
    try {
      setMesaiLoading(true);
      setMesaiError(null);

      const startIso = startOfLocalDayIso(mesaiStart);
      const endIso = endOfLocalDayIso(mesaiEnd);

      const { data, error: fetchError } = await supabase
        .from('activities')
        .select('*')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (fetchError) {
        console.warn('Mesai report fetch error', fetchError);
        setMesaiError('Mesai raporu yüklenemedi');
        setMesaiByUser([]);
        return;
      }

      const rows: ActivityRow[] = (data || []).map((r: any) => ({
        id: String(r.id),
        username: r.username,
        action: r.action,
        location_id: r.location_id,
        location_name: r.location_name,
        arrival_time: r.arrival_time,
        completion_time: r.completion_time,
        duration_minutes: r.duration_minutes,
        activity_type: r.activity_type,
        created_at: r.created_at
      }));

      const filtered = rows.filter((r) => {
        const k = normalizeUsername(r.username);
        return k && allowedUserSet.has(k);
      });

      setMesaiByUser(computeMesaiFromActivities(filtered, mesaiStart, mesaiEnd));
    } catch (e) {
      console.warn('Mesai report exception', e);
      setMesaiError('Mesai raporu yüklenemedi');
      setMesaiByUser([]);
    } finally {
      setMesaiLoading(false);
    }
  };

  const fetchCurrentTasksForMembers = async (members: TeamMemberStatus[]) => {
    try {
      const userIds = (members || []).map(m => m.user_id).filter(Boolean);
      if (userIds.length === 0) {
        setMemberCurrentTask({});
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .in('assigned_to_user_id', userIds)
        .in('status', ['assigned', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(500);

      if (fetchError) {
        console.warn('fetchCurrentTasksForMembers error', fetchError);
        return;
      }

      const byUser: Record<string, Task | null> = {};
      for (const uid of userIds) byUser[uid] = null;

      const rows: Task[] = (data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdAt: r.created_at,
        createdByUserId: r.created_by_user_id,
        createdByUsername: r.created_by_username,
        assignedToUserId: r.assigned_to_user_id,
        assignedToUsername: r.assigned_to_username,
        regionId: r.region_id,
        regionName: r.region_name,
        routeLocationIds: Array.isArray(r.route_location_ids) ? r.route_location_ids : [],
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        cancelledAt: r.cancelled_at
      }));

      // Prefer in_progress; otherwise newest assigned
      for (const t of rows) {
        const uid = t.assignedToUserId;
        const existing = byUser[uid];
        if (!existing) {
          byUser[uid] = t;
          continue;
        }
        if (existing.status !== 'in_progress' && t.status === 'in_progress') {
          byUser[uid] = t;
        }
      }

      setMemberCurrentTask(byUser);
    } catch (e) {
      console.warn('fetchCurrentTasksForMembers exception', e);
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

    const tasksChannel = supabase
      .channel('tasks_changes_team_panel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        () => {
          // refresh current tasks snapshot for visible members
          fetchCurrentTasksForMembers(teamMembers);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(tasksChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchCurrentTasksForMembers(teamMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, teamMembers]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(() => {
      fetchTeamStatus();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isOpen]);

  // Fetch activities for the selected month to compute accurate totals.
  useEffect(() => {
    if (!isOpen) return;
    const run = async () => {
      try {
        // Reset to a safe baseline so UI doesn't show stale totals while switching months.
        setMonthTotals({ completed: 0, workMinutes: 0, travelMinutes: 0 });
        setMonthByUser({});
        const startIso = startOfLocalDayIso(monthStartYmd);
        const endIso = endOfLocalDayIso(monthEndYmd);
        const { data, error: fetchError } = await supabase
          .from('activities')
          .select('*')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(5000);
        if (fetchError) {
          console.warn('monthTotals fetch error', fetchError);
          // Keep baseline zeros.
          return;
        }
        const rows: ActivityRow[] = (data || []).map((r: any) => ({
          id: String(r.id),
          username: r.username,
          action: r.action,
          location_id: r.location_id,
          location_name: r.location_name,
          arrival_time: r.arrival_time,
          completion_time: r.completion_time,
          duration_minutes: r.duration_minutes,
          activity_type: r.activity_type,
          created_at: r.created_at
        }));

        const filtered = rows.filter((r) => {
          const k = normalizeUsername(r.username);
          return k && allowedUserSet.has(k);
        });

        const byUser = computeMesaiFromActivities(filtered, monthStartYmd, monthEndYmd);
        const completed = byUser.reduce((s, u) => s + (u.total.completedCount || 0), 0);
        const workMinutes = byUser.reduce((s, u) => s + (u.total.workMinutes || 0), 0);
        const travelMinutes = byUser.reduce((s, u) => s + (u.total.travelMinutes || 0), 0);
        setMonthTotals({ completed, workMinutes, travelMinutes });

        const map: Record<string, { completed: number; workMinutes: number; travelMinutes: number }> = {};
        for (const u of byUser) {
          const k = normalizeUsername(u.username);
          if (!k) continue;
          map[k] = {
            completed: u.total.completedCount || 0,
            workMinutes: u.total.workMinutes || 0,
            travelMinutes: u.total.travelMinutes || 0
          };
        }

        // Ensure every visible member has an explicit override (0s) so cards never fall back to
        // team_status lifetime counters when looking at a month.
        for (const m of teamMembersRef.current) {
          const k = normalizeUsername(m.username);
          if (!k) continue;
          if (!map[k]) map[k] = { completed: 0, workMinutes: 0, travelMinutes: 0 };
        }
        setMonthByUser(map);
      } catch (e) {
        console.warn('monthTotals exception', e);
        setMonthTotals({ completed: 0, workMinutes: 0, travelMinutes: 0 });
        setMonthByUser({});
      }
    };
    run();
    // Refresh on open; realtime updates are optional here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedMonth, monthStartYmd, monthEndYmd, allowedUserSet]);

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

  const selectedRegion = regions.find(r => r.id === taskRegionId);
  const selectedRegionLocations = selectedRegion?.locations ?? [];
  const sortedRegionLocations = selectedRegionLocations
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base', numeric: true }));

  const filteredRegionLocations = sortedRegionLocations.filter((l) => {
    const q = taskSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(l.name || '').toLowerCase().includes(q) ||
      String(l.center || '').toLowerCase().includes(q) ||
      String(l.id || '').toLowerCase().includes(q)
    );
  });

  const isAllSelectedInRegion = selectedRegionLocations.length > 0 && selectedTaskLocationIds.length === selectedRegionLocations.length;

  const openAssignTaskModal = (member: TeamMemberStatus) => {
    if (!currentUserId) return;
    setAssignError(null);
    setTaskMember(member);
    const defaultRegionId = regions?.[0]?.id ?? 0;
    setTaskRegionId(defaultRegionId);
    const defaultRegionName = regions?.find(r => r.id === defaultRegionId)?.name ?? '';
    setTaskTitle(defaultRegionName ? `${defaultRegionName} Görevi` : 'Görev');
    setTaskDescription('');
    setTaskSearch('');
    const defaultLocs = regions?.find(r => r.id === defaultRegionId)?.locations ?? [];
    setSelectedTaskLocationIds(defaultLocs.map(l => String(l.id)));
    setIsAssignTaskModalOpen(true);
  };

  const closeAssignTaskModal = () => {
    setIsAssignTaskModalOpen(false);
    setTaskMember(null);
    setAssignError(null);
    setAssigningTask(false);
  };

  const handleAssignTask = async () => {
    if (!currentUserId || !taskMember) return;
    setAssignError(null);

    if (!taskRegionId || taskRegionId === 0) {
      setAssignError('Bölge seçiniz');
      return;
    }

    const region = selectedRegion;
    const regionLocations = selectedRegionLocations;
    if (!region || regionLocations.length === 0) {
      setAssignError('Seçilen bölgede lokasyon bulunamadı');
      return;
    }

    const selectedSet = new Set(selectedTaskLocationIds.map(String));
    const selectedLocations = regionLocations.filter(l => selectedSet.has(String(l.id)));
    if (selectedLocations.length === 0) {
      setAssignError('En az 1 lokasyon seçmelisiniz');
      return;
    }

    const routeLocationIds = selectedLocations
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base', numeric: true }))
      .map(l => l.id);

    if (routeLocationIds.length === 0) {
      setAssignError('Görev rotası boş olamaz');
      return;
    }

    setAssigningTask(true);
    try {
      const result = await createTask({
        title: taskTitle?.trim() || `${region.name} Görevi`,
        description: taskDescription?.trim() || null,
        createdByUserId: currentUserId,
        createdByUsername: currentUsername ?? null,
        assignedToUserId: taskMember.user_id,
        assignedToUsername: taskMember.username,
        regionId: region.id,
        regionName: region.name,
        routeLocationIds
      });

      if (!result.success) {
        setAssignError(result.error || 'Görev atanamadı');
        return;
      }

      // Refresh task badges immediately
      fetchCurrentTasksForMembers(teamMembers);
      closeAssignTaskModal();
    } catch (e) {
      console.warn('handleAssignTask failed', e);
      setAssignError('Görev atanamadı');
    } finally {
      setAssigningTask(false);
    }
  };

  const openTaskDetails = (member: TeamMemberStatus) => {
    const task = memberCurrentTask[member.user_id] ?? null;
    if (!task) return;
    setTaskDetailsMember(member);
    setTaskDetailsTask(task);
    setIsTaskDetailsOpen(true);
  };

  const closeTaskDetails = () => {
    setIsTaskDetailsOpen(false);
    setTaskDetailsMember(null);
    setTaskDetailsTask(null);
  };

  const activeMembers = teamMembers.filter(m => m.status !== 'idle');
  const idleMembers = teamMembers.filter(m => m.status === 'idle');
  const totalTodayCompleted = monthTotals?.completed ?? 0;
  const totalTravelMins = monthTotals?.travelMinutes ?? 0;
  const totalWorkMins = monthTotals?.workMinutes ?? 0;
  const totalInRoute = teamMembers.reduce((sum, m) => sum + (m.total_route_count || 0), 0);

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40">
      <div 
        ref={panelRef}
        className="bg-white w-full h-full flex flex-col overflow-hidden overscroll-contain"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-white/20 rounded-xl">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg sm:text-xl">Saha Ekibi Takip</h2>
              <p className="text-xs sm:text-sm text-white/80">{teamMembers.length} ekip üyesi • {monthLabel}</p>
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
            <div className="hidden sm:flex items-center gap-2 mr-1">
              <div className="text-xs text-white/70">Ay</div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value || toYyyyMm(new Date()))}
                className="h-9 px-2 rounded-lg bg-white/10 text-white text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4 p-3 sm:p-4 bg-gray-50 border-b border-gray-200">
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
            <div className="p-1.5 bg-gray-200 rounded-lg">
              <Briefcase className="w-4 h-4 text-gray-700" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Toplam Çalışma</div>
              <div className="text-sm font-bold text-gray-800">{formatMinutes(totalWorkMins)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-2 shadow-sm col-span-2 sm:col-span-1">
            <div className="p-1.5 bg-gray-200 rounded-lg">
              <TrendingUp className="w-4 h-4 text-gray-700" />
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
              {/* Admin Mesai Raporu */}
              {isAdmin && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !mesaiOpen;
                      setMesaiOpen(next);
                      if (next) {
                        // Ensure inputs are sane, then fetch.
                        const start = mesaiStart || monthStartYmd;
                        const end = mesaiEnd || start;
                        setMesaiStart(start);
                        setMesaiEnd(end);
                        fetchMesaiReport();
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 text-white"
                  >
                    <div className="flex items-center gap-2">
                      <Timer className="w-5 h-5" />
                      <div className="text-sm font-semibold">Mesai Raporu</div>
                      <div className="text-xs text-white/70">(hangi gün ne yapmış / toplam mesai)</div>
                    </div>
                    {mesaiOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>

                  {mesaiOpen && (
                    <div className="p-4 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-xs text-gray-500">Başlangıç</div>
                            <input
                              type="date"
                              value={mesaiStart}
                              onChange={(e) => {
                                const v = e.target.value;
                                setMesaiStart(v);
                                if (mesaiEnd && v > mesaiEnd) setMesaiEnd(v);
                              }}
                              className="mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Bitiş</div>
                            <input
                              type="date"
                              value={mesaiEnd}
                              onChange={(e) => {
                                const v = e.target.value;
                                setMesaiEnd(v);
                                if (mesaiStart && v < mesaiStart) setMesaiStart(v);
                              }}
                              className="mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={fetchMesaiReport}
                            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800"
                            disabled={mesaiLoading}
                          >
                            {mesaiLoading ? 'Yükleniyor…' : 'Raporu Getir'}
                          </button>
                          <button
                            onClick={() => {
                              setMesaiStart(monthStartYmd);
                              setMesaiEnd(monthEndYmd);
                              setTimeout(() => fetchMesaiReport(), 0);
                            }}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Seçili ay
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500">
                        Mesai kuralı: Hafta içi 09:00–18:00, Cumartesi 09:00–14:00, Pazar normal mesai yok (tamamı ek mesai).
                        <span className="ml-2">Not: "Yol" süreleri yeni kayıtlarda otomatik loglanır; eski kayıtlarda 0 görünebilir.</span>
                      </div>

                      {mesaiError && (
                        <div className="text-sm text-red-600">{mesaiError}</div>
                      )}

                      {!mesaiError && !mesaiLoading && mesaiByUser.length === 0 && (
                        <div className="text-sm text-gray-500">Bu tarih aralığında kayıt bulunamadı.</div>
                      )}

                      {!mesaiError && mesaiByUser.length > 0 && (
                        <>
                          {/* Global summary */}
                          {(() => {
                            const sumCompleted = mesaiByUser.reduce((s, u) => s + (u.total.completedCount || 0), 0);
                            const sumWork = mesaiByUser.reduce((s, u) => s + (u.total.workMinutes || 0), 0);
                            const sumTravel = mesaiByUser.reduce((s, u) => s + (u.total.travelMinutes || 0), 0);
                            const sumNormal = mesaiByUser.reduce((s, u) => s + (u.total.normalMinutes || 0), 0);
                            const sumOver = mesaiByUser.reduce((s, u) => s + (u.total.overtimeMinutes || 0), 0);
                            return (
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  <div className="text-xs text-gray-500">Tamamlanan</div>
                                  <div className="text-sm font-bold text-gray-900">{sumCompleted}</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  <div className="text-xs text-gray-500">Çalışma</div>
                                  <div className="text-sm font-bold text-gray-900">{formatMinutes(sumWork)}</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  <div className="text-xs text-gray-500">Yol</div>
                                  <div className="text-sm font-bold text-gray-900">{formatMinutes(sumTravel)}</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  <div className="text-xs text-gray-500">Normal mesai</div>
                                  <div className="text-sm font-bold text-gray-900">{formatMinutes(sumNormal)}</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  <div className="text-xs text-gray-500">Ek mesai</div>
                                  <div className="text-sm font-bold text-gray-900">{formatMinutes(sumOver)}</div>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="space-y-2">
                            {mesaiByUser.map((u) => {
                              const expanded = !!mesaiExpanded[u.username];
                              const overtimeMinutes = u.total.overtimeMinutes || 0;
                              const dayKeys = Object.keys(u.days).sort().reverse();
                              return (
                                <div key={u.username} className="border border-gray-200 rounded-lg overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setMesaiExpanded((prev) => ({ ...prev, [u.username]: !expanded }))}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                                        {String(u.username).slice(0, 1).toUpperCase()}
                                      </div>
                                      <div className="text-left">
                                        <div className="text-sm font-semibold text-gray-900">{u.username}</div>
                                        <div className="text-xs text-gray-500">
                                          {u.total.firstAt ? formatTime(u.total.firstAt) : '--:--'} - {u.total.lastAt ? formatTime(u.total.lastAt) : '--:--'} • {u.total.completedCount} tamamlanan
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="text-right">
                                        <div className="text-sm font-bold text-gray-900">Toplam: {formatMinutes(u.total.totalMinutes)}</div>
                                        <div className="text-xs text-gray-500">Normal: {formatMinutes(u.total.normalMinutes)} • Ek: {formatMinutes(overtimeMinutes)}</div>
                                      </div>
                                      {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                                    </div>
                                  </button>

                                  {expanded && (
                                    <div className="px-4 pb-4 space-y-3">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                                          <div className="text-[11px] text-gray-500">Çalışma</div>
                                          <div className="text-sm font-bold text-gray-900">{formatMinutes(u.total.workMinutes)}</div>
                                        </div>
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                                          <div className="text-[11px] text-gray-500">Yol</div>
                                          <div className="text-sm font-bold text-gray-900">{formatMinutes(u.total.travelMinutes)}</div>
                                        </div>
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                                          <div className="text-[11px] text-gray-500">Normal mesai</div>
                                          <div className="text-sm font-bold text-gray-900">{formatMinutes(u.total.normalMinutes)}</div>
                                        </div>
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                                          <div className="text-[11px] text-gray-500">Ek mesai</div>
                                          <div className="text-sm font-bold text-gray-900">{formatMinutes(overtimeMinutes)}</div>
                                        </div>
                                      </div>

                                      <div className="border-t border-gray-100 pt-3">
                                        <div className="text-xs font-semibold text-gray-700 mb-2">Günlük kırılım</div>
                                        <div className="space-y-1">
                                          {dayKeys.map((k) => {
                                            const d = u.days[k];
                                            const over = d.overtimeMinutes || 0;
                                            return (
                                              <div key={k} className="flex items-center justify-between text-sm">
                                                <div className="text-gray-700">
                                                  <span className="font-medium">{k}</span>
                                                  <span className="text-gray-400"> • </span>
                                                  <span className="text-gray-600">{d.completedCount} tamamlanan</span>
                                                  <span className="text-gray-400"> • </span>
                                                  <span className="text-gray-600">Çalışma {formatMinutes(d.workMinutes)} / Yol {formatMinutes(d.travelMinutes)}</span>
                                                </div>
                                                <div className="text-right">
                                                  <div className="font-semibold text-gray-900">{formatMinutes(d.totalMinutes)}</div>
                                                  <div className="text-xs text-gray-500">Normal: {formatMinutes(d.normalMinutes)} • Ek: {formatMinutes(over)}</div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      <div className="border-t border-gray-100 pt-3">
                                        <div className="text-xs font-semibold text-gray-700 mb-2">Tamamlanan işler</div>
                                        <div className="max-h-52 overflow-y-auto pr-1 space-y-1">
                                          {u.completions.slice(0, 200).map((c, idx) => (
                                            <div key={`${c.date}-${c.locationName}-${idx}`} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                              <div className="min-w-0">
                                                <div className="text-gray-900 font-medium truncate">{c.locationName}</div>
                                                <div className="text-xs text-gray-500 truncate">
                                                  {c.date}
                                                  <span className="text-gray-400"> • </span>
                                                  <span>Çıkış {c.departedAt ? formatTime(c.departedAt) : '--:--'}</span>
                                                  <span className="text-gray-400"> • </span>
                                                  <span>Varış {c.arrivedAt ? formatTime(c.arrivedAt) : '--:--'}</span>
                                                  <span className="text-gray-400"> • </span>
                                                  <span>Bitiş {c.completedAt ? formatTime(c.completedAt) : '--:--'}</span>
                                                </div>
                                              </div>
                                              <div className="text-right shrink-0 pl-3">
                                                <div className="text-gray-900 font-semibold">İş {formatMinutes(c.workMinutes)}</div>
                                                <div className="text-xs text-gray-500">Yol {formatMinutes(c.travelMinutes || 0)}</div>
                                              </div>
                                            </div>
                                          ))}
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
                  )}
                </div>
              )}

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
                        currentTask={memberCurrentTask[member.user_id] ?? null}
                        onAssignTask={currentUserId ? () => openAssignTaskModal(member) : undefined}
                        onOpenTaskDetails={() => openTaskDetails(member)}
                        todayOverride={monthByUser[normalizeUsername(member.username)] ?? { completed: 0, workMinutes: 0, travelMinutes: 0 }}
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
                        currentTask={memberCurrentTask[member.user_id] ?? null}
                        onAssignTask={currentUserId ? () => openAssignTaskModal(member) : undefined}
                        onOpenTaskDetails={() => openTaskDetails(member)}
                        todayOverride={monthByUser[normalizeUsername(member.username)] ?? { completed: 0, workMinutes: 0, travelMinutes: 0 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Assign Task Modal */}
        {isAssignTaskModalOpen && taskMember && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1210] p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold">Görev Ata</h3>
                  <p className="text-sm text-gray-600">Kişi: <span className="font-semibold">{taskMember.username}</span></p>
                </div>
                <button
                  onClick={closeAssignTaskModal}
                  className="p-2 rounded-lg hover:bg-gray-100"
                  title="Kapat"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {assignError ? (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                  {assignError}
                </div>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bölge</label>
                  <select
                    value={taskRegionId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setTaskRegionId(id);
                      const name = regions.find(r => r.id === id)?.name ?? '';
                      if (name) setTaskTitle(`${name} Görevi`);
                      setTaskSearch('');
                      const locs = regions.find(r => r.id === id)?.locations ?? [];
                      setSelectedTaskLocationIds(locs.map(l => String(l.id)));
                    }}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value={0}>Bölge seçiniz</option>
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>{r.id}. Bölge - {r.name}</option>
                    ))}
                  </select>
                  {taskRegionId !== 0 ? (
                    <div className="mt-1 text-xs text-gray-500">
                      Lokasyon sayısı: {(regions.find(r => r.id === taskRegionId)?.locations?.length ?? 0)}
                    </div>
                  ) : null}
                </div>

                {taskRegionId !== 0 && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="block text-sm font-medium text-gray-700">Lokasyonlar</label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedRegionLocations.length) return;
                          if (isAllSelectedInRegion) setSelectedTaskLocationIds([]);
                          else setSelectedTaskLocationIds(selectedRegionLocations.map(l => String(l.id)));
                        }}
                        className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                      >
                        {isAllSelectedInRegion ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                      placeholder="Ara (isim/merkez/id)"
                    />

                    <div className="border border-gray-200 rounded-lg max-h-56 overflow-auto">
                      {filteredRegionLocations.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500">Lokasyon bulunamadı</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {filteredRegionLocations.map((loc) => {
                            const id = String(loc.id);
                            const checked = selectedTaskLocationIds.includes(id);
                            return (
                              <label key={id} className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked;
                                    setSelectedTaskLocationIds((prev) => {
                                      const set = new Set(prev);
                                      if (next) set.add(id);
                                      else set.delete(id);
                                      return Array.from(set);
                                    });
                                  }}
                                  className="mt-1"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{loc.name}</div>
                                  <div className="text-xs text-gray-500 truncate">{loc.center}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-gray-500">Seçili: {selectedTaskLocationIds.length}</div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Başlık</label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Görev başlığı"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (opsiyonel)</label>
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[90px]"
                    placeholder="Not / açıklama"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-2 justify-end">
                <button
                  onClick={closeAssignTaskModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  disabled={assigningTask}
                >
                  Vazgeç
                </button>
                <button
                  onClick={handleAssignTask}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                  disabled={assigningTask}
                >
                  {assigningTask ? 'Atanıyor…' : 'Görev Ata'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Details Modal */}
        {isTaskDetailsOpen && taskDetailsMember && taskDetailsTask && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1210] p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold">Mevcut Görev</h3>
                  <p className="text-sm text-gray-600">Kişi: <span className="font-semibold">{taskDetailsMember.username}</span></p>
                </div>
                <button
                  onClick={closeTaskDetails}
                  className="p-2 rounded-lg hover:bg-gray-100"
                  title="Kapat"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm text-gray-500">Başlık</div>
                  <div className="font-semibold text-gray-900">{taskDetailsTask.title}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Durum</div>
                    <div className="text-sm font-semibold text-gray-900">{taskDetailsTask.status === 'in_progress' ? 'Devam Ediyor' : 'Atandı'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Lokasyon</div>
                    <div className="text-sm font-semibold text-gray-900">{Array.isArray(taskDetailsTask.routeLocationIds) ? taskDetailsTask.routeLocationIds.length : 0}</div>
                  </div>
                </div>
                {taskDetailsTask.regionName ? (
                  <div>
                    <div className="text-sm text-gray-500">Bölge</div>
                    <div className="text-sm font-semibold text-gray-900">{taskDetailsTask.regionName}</div>
                  </div>
                ) : null}
                {taskDetailsTask.description ? (
                  <div>
                    <div className="text-sm text-gray-500">Açıklama</div>
                    <div className="text-sm text-gray-800 whitespace-pre-line">{taskDetailsTask.description}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={closeTaskDetails}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface TeamMemberCardProps {
  member: TeamMemberStatus;
  onFocus?: (memberId: string, username: string, lat: number, lng: number) => void;
  currentTask?: Task | null;
  onAssignTask?: () => void;
  onOpenTaskDetails?: () => void;
  todayOverride?: { completed: number; workMinutes: number; travelMinutes: number } | null;
}

const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ member, onFocus, currentTask, onAssignTask, onOpenTaskDetails, todayOverride = null }) => {
  const [showCompletedList, setShowCompletedList] = useState(false);
  const statusInfo = statusLabels[member.status] || statusLabels.idle;
  const isActive = member.status !== 'idle';
  const completedLocations = member.completed_locations || [];

  const todayCompleted = todayOverride?.completed ?? (member.today_completed_count || 0);
  const todayTravel = todayOverride?.travelMinutes ?? (member.total_travel_minutes || 0);
  const todayWork = todayOverride?.workMinutes ?? (member.total_work_minutes || 0);
  
  const handleFocusClick = () => {
    if (onFocus && member.current_lat && member.current_lng) {
      onFocus(member.user_id, member.username, member.current_lat, member.current_lng);
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
      isActive ? 'border-gray-200 shadow-md' : 'border-gray-100 shadow-sm'
    }`}>
      {/* Header Row */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
              isActive ? 'bg-gray-900' : 'bg-gray-500'
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
            <div className="text-lg font-bold text-green-600">{todayCompleted}</div>
            <div className="text-[10px] text-green-700 font-medium">Tamamlanan</div>
          </div>
          <div className="text-center bg-orange-50 rounded-lg py-2">
            <div className="text-lg font-bold text-orange-600">{formatMinutes(todayTravel)}</div>
            <div className="text-[10px] text-orange-700 font-medium">Yol Süresi</div>
          </div>
          <div className="text-center bg-gray-100 rounded-lg py-2">
            <div className="text-lg font-bold text-gray-900">{formatMinutes(todayWork)}</div>
            <div className="text-[10px] text-gray-700 font-medium">Çalışma</div>
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
            {todayCompleted > 0 && (
              <div className="text-xs text-green-600 mt-1">
                Seçili ay {todayCompleted} yer tamamladı
              </div>
            )}
          </div>
        )}
      </div>

      {currentTask && onOpenTaskDetails ? (
        <button
          onClick={onOpenTaskDetails}
          className="w-full mb-1 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 flex items-center justify-center gap-2"
        >
          <ListChecks className="w-4 h-4" />
          Mevcut Görev
        </button>
      ) : onAssignTask ? (
        <button
          onClick={onAssignTask}
          className="w-full mb-1 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 flex items-center justify-center gap-2"
        >
          <ListChecks className="w-4 h-4" />
          Görev Ata
        </button>
      ) : null}

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
      {(member.status === 'yolda' || member.status === 'adreste') && member.current_lat && member.current_lng && onFocus && (
        <div className="px-4 pb-4">
          <button
            onClick={handleFocusClick}
            className="w-full py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center gap-2 border border-indigo-200"
          >
            <Navigation className="w-4 h-4" />
            Haritada takip et
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamPanel;
