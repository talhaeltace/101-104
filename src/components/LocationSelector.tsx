import React, { useCallback, useState, useRef } from 'react';
import { Search, MapPin, Cpu, ChevronDown, ChevronUp, DoorClosed, Filter } from 'lucide-react';
import { Location, Region } from '../data/regions';
import { fieldsMatchQuery } from '../lib/search';

type StatusFilterKey =
  | 'active'
  | 'configured'
  | 'started'
  | 'installed'
  | 'installed_only'
  | 'accepted'
  | 'untouched'
  | 'todo'
  | 'missing'
  | 'card'
  | 'notes'
  | 'card_installed'
  | 'card_active'
  | 'rtu'
  | 'rtu_installed'
  | 'rtu_todo';

const FILTER_OPTIONS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: 'accepted', label: 'Kabulü Yapılanlar' },
  { key: 'active', label: 'Devreye Alınmış' },
  { key: 'configured', label: 'Konfigüre Edildi' },
  { key: 'started', label: 'Başlandı' },
  { key: 'rtu', label: 'RTU Var' },
  { key: 'rtu_installed', label: 'RTU Kuruldu' },
  { key: 'rtu_todo', label: 'RTU Tamamlanacak' },
  { key: 'card', label: 'Kartlı Geçiş' },
  { key: 'installed', label: 'Montajı Yapıldı' },
  { key: 'installed_only', label: 'Sadece Montajı Yapıldı' },
  { key: 'card_installed', label: 'Montajı Yapılmış (Kartlı geçiş)' },
  { key: 'card_active', label: 'Devreye Alınmış (Kartlı geçiş)' },
  { key: 'todo', label: 'Tamamlanacak' },
  { key: 'missing', label: 'Eksik' },
  { key: 'untouched', label: 'Hiç Girilmedi' },
  { key: 'notes', label: 'Notlar' },
];

interface LocationSelectorProps {
  locations: Location[];
  // when showing all regions, pass the full regions list so we can render headers
  regions?: Region[];
  selectedRegion?: number;
  // optional external search control (header search)
  searchTerm?: string;
  onSearchTermChange?: (s: string) => void;
  selectedLocation: Location | null;
  onLocationSelect: (location: Location) => void;
  onLocationDoubleClick?: (location: Location) => void;
  onShowDetails?: (location: Location) => void;
  // optional controlled filter state (multi-select). Empty/undefined means "Tümü".
  statusFilters?: StatusFilterKey[];
  onStatusFiltersChange?: (filters: StatusFilterKey[]) => void;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({ 
  locations,
  regions,
  selectedRegion = 0,
  searchTerm: searchTermProp,
  onSearchTermChange,
  selectedLocation,
  onLocationSelect, 
  onLocationDoubleClick,
  onShowDetails,
  statusFilters: statusFiltersProp,
  onStatusFiltersChange
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const effectiveSearchTerm = typeof searchTermProp === 'string' ? searchTermProp : internalSearchTerm;
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem('location_selector_expanded_v1') !== '0';
    } catch {
      return true;
    }
  });
  const [isPressed, setIsPressed] = useState(false);

  // Keep the filter panel always open (requested).
  const isFilterExpanded = true;

  const [internalStatusFilters, setInternalStatusFilters] = useState<StatusFilterKey[]>([]);
  const effectiveStatusFilters = statusFiltersProp ?? internalStatusFilters;

  const setStatusFilters = (next: StatusFilterKey[]) => {
    const unique = Array.from(new Set(next));
    if (onStatusFiltersChange) onStatusFiltersChange(unique);
    else setInternalStatusFilters(unique);
  };

  React.useEffect(() => {
    try {
      localStorage.setItem('location_selector_expanded_v1', isExpanded ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [isExpanded]);

  const normalizeDirectorateField = useCallback((value: unknown) => String(value ?? '').trim().toUpperCase(), []);

  const isDirectorateLocation = useCallback((loc: Location) => {
    const maybe = loc as unknown as { brand?: unknown; model?: unknown };
    return (
      normalizeDirectorateField(maybe.brand) === 'BÖLGE' &&
      normalizeDirectorateField(maybe.model) === 'MÜDÜRLÜK'
    );
  }, [normalizeDirectorateField]);


  // If an external searchTerm is provided (header search), auto-expand the selector
  // after the user pauses typing (debounced). This prevents layout thrash / scroll
  // jumps that can happen when we expand the list on every keystroke.
  React.useEffect(() => {
    if (typeof searchTermProp !== 'string') return;
    if (!searchTermProp || searchTermProp.length === 0) return;
    const t = setTimeout(() => setIsExpanded(true), 150);
    return () => clearTimeout(t);
  }, [searchTermProp]);

  const getStatus = (location: Location) => {
    // New scheme (requested): Accepted > Installed > Started(Ring) > Untouched
    if (isDirectorateLocation(location)) {
      return { label: 'Bölge Müdürlüğü', colorClass: 'text-slate-600', dotClass: 'bg-slate-400' };
    }

    const details = location.details;
    if (details.isAccepted) {
      return { label: 'Kabul Edildi', colorClass: 'text-green-600', dotClass: 'bg-green-500' };
    }
    if (details.isInstalled) {
      return { label: 'Kurulum Tamam', colorClass: 'text-blue-600', dotClass: 'bg-blue-500' };
    }
    if (details.isConfigured) {
      return { label: 'Başlandı', colorClass: 'text-amber-600', dotClass: 'bg-amber-500' };
    }
    return { label: 'Hiç Girilmedi', colorClass: 'text-amber-900', dotClass: 'bg-amber-800' };
  };

  const getPlannedRtuCount = useCallback((loc: Location) => {
    const eq = loc.details?.equipment;
    const rtuCount = eq?.rtuCount ?? 0;
    if (rtuCount > 0) return rtuCount;
    const teias = eq?.teiasRtuInstallation ?? 0;
    if (teias > 0) return teias;
    return loc.details?.hasRTU ? 1 : 0;
  }, []);

  const isRtuLocation = useCallback((loc: Location) => getPlannedRtuCount(loc) > 0 || !!loc.details?.hasRTU, [getPlannedRtuCount]);

  const matchesOneStatus = useCallback((filterKey: StatusFilterKey, location: Location) => {
    // Directorate locations are navigation/map items; they should not affect operational filters.
    // Allow 'notes' so they can still be found when needed.
    if (isDirectorateLocation(location)) {
      return filterKey === 'notes' && !!(location.note && String(location.note).trim().length > 0);
    }

    switch (filterKey) {
      case 'active':
        return !!(location.details.isActive && location.details.isConfigured);
      case 'configured':
        return !!location.details.isConfigured;
      case 'started':
        return !!location.details.isConfigured && !location.details.isInstalled && !location.details.isAccepted;
      case 'card_installed':
        return !!(location.details.hasCardAccess && location.details.isInstalledCardAccess);
      case 'card_active':
        return !!(location.details.hasCardAccess && location.details.isActiveCardAccess);
      case 'card':
        return !!location.details.hasCardAccess;
      case 'notes':
        return !!(location.note && String(location.note).trim().length > 0);
      case 'installed':
        return !!location.details.isInstalled;
      case 'installed_only':
        return !!location.details.isInstalled && !location.details.isAccepted;
      case 'todo':
        return !location.details.isActive;
      case 'missing':
        return !location.details.isActive && !location.details.isConfigured;
      case 'accepted':
        return !!location.details.isAccepted;
      case 'untouched':
        return !location.details.isConfigured && !location.details.isInstalled && !location.details.isAccepted;
      case 'rtu':
        return isRtuLocation(location);
      case 'rtu_installed':
        return !!location.details.hasRTU;
      case 'rtu_todo':
        return !location.details.hasRTU && getPlannedRtuCount(location) > 0;
      default:
        return true;
    }
  }, [getPlannedRtuCount, isDirectorateLocation, isRtuLocation]);

  const matchesStatus = (location: Location) => {
    if (!effectiveStatusFilters || effectiveStatusFilters.length === 0) return true; // Tümü
    return effectiveStatusFilters.some(k => matchesOneStatus(k, location));
  };

  const q = effectiveSearchTerm || '';

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const opt of FILTER_OPTIONS) counts[opt.key] = 0;

    const baseAll = (selectedRegion === 0 && regions && regions.length > 0)
      ? regions.flatMap(r => r.locations)
      : locations;

    // Exclude "Bölge Müdürlüğü" placeholder locations from counts/denominators.
    // These are navigation/map helpers and should not inflate operational totals.
    const base = baseAll.filter(loc => !isDirectorateLocation(loc));

    for (const loc of base) {
      if (!fieldsMatchQuery(q, loc.name, loc.center, loc.id)) continue;
      for (const opt of FILTER_OPTIONS) {
        try {
          if (matchesOneStatus(opt.key, loc)) counts[opt.key] = (counts[opt.key] ?? 0) + 1;
        } catch {
          // ignore
        }
      }
    }

    counts.__total = base.filter(loc => fieldsMatchQuery(q, loc.name, loc.center, loc.id)).length;
    return counts;
  }, [locations, regions, selectedRegion, q, isDirectorateLocation, matchesOneStatus]);

  const totalBaseCount = statusCounts.__total ?? 0;

  const selectedFiltersSummary = React.useMemo(() => {
    if (!effectiveStatusFilters || effectiveStatusFilters.length === 0) {
      return `Tümü (${totalBaseCount})`;
    }

    const labelFor = (k: StatusFilterKey) => FILTER_OPTIONS.find(o => o.key === k)?.label ?? String(k);
    return effectiveStatusFilters
      .map((k) => `${labelFor(k)} (${statusCounts[k] ?? 0}/${totalBaseCount})`)
      .join(', ');
  }, [effectiveStatusFilters, statusCounts, totalBaseCount]);
  const filteredLocations = locations
    .filter(location => (fieldsMatchQuery(q, location.name, location.center, location.id)) && matchesStatus(location))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  // When showing all regions (selectedRegion === 0) and regions prop is provided,
  // build a grouped structure so we can render headers like "1. Bölge" above each group's items.
  const grouped = (selectedRegion === 0 && regions && regions.length > 0)
    ? regions.map(r => ({
        region: r,
        items: r.locations
          .filter(loc => (fieldsMatchQuery(q, loc.name, loc.center, loc.id) && matchesStatus(loc)))
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      }))
    : null;

  // no-op: selectedRegionObj removed to avoid unused var warnings

  // build the list content as a precomputed node to avoid large inline ternaries
  let listContent: React.ReactNode;
  if (grouped) {
    listContent = grouped.map(g => (
      <div key={g.region.id} className="mb-4">
        <div className="px-2 py-1 rounded-md bg-gray-50 border border-gray-100 mb-2 font-semibold text-sm">
          {g.region.id}. Bölge Müdürlüğü
          {g.region.id === 1 && (
        <span className="text-gray-500 font-normal ml-2">(İstanbul / Avrupa)</span>
          )}
          {g.region.id === 2 && (
        <span className="text-gray-500 font-normal ml-2">(Bursa)</span>
          )}
          {g.region.id === 3 && (
        <span className="text-gray-500 font-normal ml-2">(İzmir)</span>
          )}
          {g.region.id === 4 && (
        <span className="text-gray-500 font-normal ml-2">(İstanbul / Anadolu)</span>
          )}
          {g.region.id === 5 && (
        <span className="text-gray-500 font-normal ml-2">(Sakarya)</span>
          )}
          {g.region.id === 6 && (
        <span className="text-gray-500 font-normal ml-2">(Kütahya)</span>
          )}
          {g.region.id === 7 && (
        <span className="text-gray-500 font-normal ml-2">(Isparta)</span>
          )}
          {g.region.id === 8 && (
        <span className="text-gray-500 font-normal ml-2">(Ankara)</span>
          )}
          {g.region.id === 9 && (
        <span className="text-gray-500 font-normal ml-2">(Konya)</span>
          )}
          {g.region.id === 10 && (
        <span className="text-gray-500 font-normal ml-2">(Samsun)</span>
          )}
          {g.region.id === 11 && (
        <span className="text-gray-500 font-normal ml-2">(Kayseri)</span>
          )}
          {g.region.id === 12 && (
        <span className="text-gray-500 font-normal ml-2">(Gaziantep)</span>
          )}
          {g.region.id === 13 && (
        <span className="text-gray-500 font-normal ml-2">(Elazığ)</span>
          )}
          {g.region.id === 14 && (
        <span className="text-gray-500 font-normal ml-2">(Trabzon)</span>
          )}
          {g.region.id === 15 && (
        <span className="text-gray-500 font-normal ml-2">(Erzurum)</span>
          )}
          {g.region.id === 16 && (
        <span className="text-gray-500 font-normal ml-2">(Batman)</span>
          )}
          {g.region.id === 17 && (
        <span className="text-gray-500 font-normal ml-2">(Van)</span>
          )}
          {g.region.id === 18 && (
        <span className="text-gray-500 font-normal ml-2">(Adana)</span>
          )}
          {g.region.id === 19 && (
        <span className="text-gray-500 font-normal ml-2">(Antalya)</span>
          )}
          {g.region.id === 20 && (
        <span className="text-gray-500 font-normal ml-2">(Edirne)</span>
          )}
          {g.region.id === 21 && (
        <span className="text-gray-500 font-normal ml-2">(Denizli)</span>
          )}
          {g.region.id === 22 && (
        <span className="text-gray-500 font-normal ml-2">(Kastamonu)</span>
          )}
        </div>
        {g.items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {g.items.map(location => {
              const status = getStatus(location);
              return (
                <div
                  key={`${g.region.id}-${location.id}`}
                  onClick={() => {
                    onLocationSelect(location);
                    if (onShowDetails) requestAnimationFrame(() => onShowDetails(location));
                  }}
                  onDoubleClick={() => onLocationDoubleClick?.(location)}
                  className={`group relative bg-white rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedLocation?.id === location.id 
                      ? 'border-blue-400 bg-blue-50 shadow-sm' 
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {/* Status indicator dot - top right */}
                  <div className={`absolute top-3 right-3 w-3 h-3 rounded-full ${status.dotClass} ring-2 ring-white`} />

                  {/* Card access door indicator (under the status dot) */}
                  {location.details.hasCardAccess ? (
                    <div className="absolute top-6 right-2 flex items-center gap-0.5 rounded-md bg-white/90 px-1 py-0.5">
                      <DoorClosed className="w-3.5 h-3.5 text-gray-600" />
                      {location.details.isTwoDoorCardAccess ? (
                        <DoorClosed className="w-3.5 h-3.5 text-gray-600" />
                      ) : null}
                    </div>
                  ) : null}
                  
                  {/* Location name */}
                  <div className="flex items-start gap-2 mb-3 pr-4">
                    <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${status.colorClass}`} />
                    <h4 className="font-semibold text-gray-900 text-sm leading-tight">{location.name}</h4>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center text-gray-600">
                      <span className="text-gray-400 w-14 flex-shrink-0">Merkez</span>
                      <span className="font-medium truncate">{location.center}</span>
                    </div>
                    
                    <div className="flex items-center text-gray-600">
                      <Cpu className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                      <span className="truncate">{location.brand} - {location.model}</span>
                    </div>
                  </div>

                  {/* Status badge - bottom */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.colorClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`}></span>
                      {status.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 text-sm text-gray-500">Bu bölgede arama kriterlerine uyan lokasyon yok.</div>
        )}
      </div>
    ));
  } else {
    listContent = (
      <div>
        {/* If a single region is selected, show its header with city name */}
        {selectedRegion && selectedRegion !== 0 && (
          <div className="px-2 py-1 rounded-md bg-gray-50 border border-gray-100 mb-2 font-semibold text-sm">
        {selectedRegion}. Bölge Müdürlüğü
        {selectedRegion === 1 && (
          <span className="text-gray-500 font-normal ml-2">(İstanbul / Avrupa)</span>
        )}
        {selectedRegion === 2 && (
          <span className="text-gray-500 font-normal ml-2">(Bursa)</span>
        )}
        {selectedRegion === 3 && (
          <span className="text-gray-500 font-normal ml-2">(İzmir)</span>
        )}
        {selectedRegion === 4 && (
          <span className="text-gray-500 font-normal ml-2">(İstanbul / Anadolu)</span>
        )}
        {selectedRegion === 5 && (
          <span className="text-gray-500 font-normal ml-2">(Sakarya)</span>
        )}
        {selectedRegion === 6 && (
          <span className="text-gray-500 font-normal ml-2">(Kütahya)</span>
        )}
        {selectedRegion === 7 && (
          <span className="text-gray-500 font-normal ml-2">(Isparta)</span>
        )}
        {selectedRegion === 8 && (
          <span className="text-gray-500 font-normal ml-2">(Ankara)</span>
        )}
        {selectedRegion === 9 && (
          <span className="text-gray-500 font-normal ml-2">(Konya)</span>
        )}
        {selectedRegion === 10 && (
          <span className="text-gray-500 font-normal ml-2">(Samsun)</span>
        )}
        {selectedRegion === 11 && (
          <span className="text-gray-500 font-normal ml-2">(Kayseri)</span>
        )}
        {selectedRegion === 12 && (
          <span className="text-gray-500 font-normal ml-2">(Gaziantep)</span>
        )}
        {selectedRegion === 13 && (
          <span className="text-gray-500 font-normal ml-2">(Elazığ)</span>
        )}
        {selectedRegion === 14 && (
          <span className="text-gray-500 font-normal ml-2">(Trabzon)</span>
        )}
        {selectedRegion === 15 && (
          <span className="text-gray-500 font-normal ml-2">(Erzurum)</span>
        )}
        {selectedRegion === 16 && (
          <span className="text-gray-500 font-normal ml-2">(Batman)</span>
        )}
        {selectedRegion === 17 && (
          <span className="text-gray-500 font-normal ml-2">(Van)</span>
        )}
        {selectedRegion === 18 && (
          <span className="text-gray-500 font-normal ml-2">(Adana)</span>
        )}
        {selectedRegion === 19 && (
          <span className="text-gray-500 font-normal ml-2">(Antalya)</span>
        )}
        {selectedRegion === 20 && (
          <span className="text-gray-500 font-normal ml-2">(Edirne)</span>
        )}
        {selectedRegion === 21 && (
          <span className="text-gray-500 font-normal ml-2">(Denizli)</span>
        )}
        {selectedRegion === 22 && (
          <span className="text-gray-500 font-normal ml-2">(Kastamonu)</span>
        )}
          </div>
        )}


        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredLocations.map((location) => {
            const status = getStatus(location);
            return (
              <div
                key={location.id}
                onClick={() => {
                  onLocationSelect(location);
                  if (onShowDetails) requestAnimationFrame(() => onShowDetails(location));
                }}
                onDoubleClick={() => onLocationDoubleClick?.(location)}
                className={`group relative bg-white rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedLocation?.id === location.id 
                    ? 'border-blue-400 bg-blue-50 shadow-sm' 
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                {/* Status indicator dot - top right */}
                <div className={`absolute top-3 right-3 w-3 h-3 rounded-full ${status.dotClass} ring-2 ring-white`} />

                {/* Card access door indicator (under the status dot) */}
                {location.details.hasCardAccess ? (
                  <div className="absolute top-6 right-2 flex items-center gap-0.5 rounded-md bg-white/90 px-1 py-0.5">
                    <DoorClosed className="w-3.5 h-3.5 text-gray-600" />
                    {location.details.isTwoDoorCardAccess ? (
                      <DoorClosed className="w-3.5 h-3.5 text-gray-600" />
                    ) : null}
                  </div>
                ) : null}
                
                {/* Location name */}
                <div className="flex items-start gap-2 mb-3 pr-4">
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${status.colorClass}`} />
                  <h4 className="font-semibold text-gray-900 text-sm leading-tight">{location.name}</h4>
                </div>

                {/* Info rows */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center text-gray-600">
                    <span className="text-gray-400 w-14 flex-shrink-0">Merkez</span>
                    <span className="font-medium truncate">{location.center}</span>
                  </div>

                  <div className="flex items-center text-gray-600">
                    <Cpu className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                    <span className="truncate">{location.brand} - {location.model}</span>
                  </div>
                </div>

                {/* Status badge - bottom */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.colorClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`}></span>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}

          {filteredLocations.length === 0 && (
            <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5 p-8 text-center text-gray-500">
              <Search className="w-8 h-8 mx-auto mb-3 text-gray-400" />
              <p>Aradığınız kriterlere uygun lokasyon bulunamadı.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-t border-gray-200 shadow-lg">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Lokasyon Seçici</h3>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>
        </div>

        {/* Filter (multi-select) */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Filtre</label>
          <button
            type="button"
            onClick={() => {
              // intentionally no-op: filter panel stays open
            }}
            className="w-full flex items-center justify-between gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="truncate text-gray-700">
                {selectedFiltersSummary}
              </span>
            </div>
            <ChevronUp className="w-4 h-4 text-gray-500" />
          </button>

          {isFilterExpanded && (
            <div
              className="mt-2 rounded-xl border border-gray-200 bg-white shadow-sm p-2"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
            <button
              type="button"
              onClick={() => setStatusFilters([])}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-left"
            >
              <input
                type="checkbox"
                readOnly
                checked={effectiveStatusFilters.length === 0}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-800">Tümü</span>
              <span className="ml-auto text-xs text-gray-500 tabular-nums">({totalBaseCount})</span>
            </button>

            <div className="my-1 h-px bg-gray-100" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {FILTER_OPTIONS.map(opt => {
                  const checked = effectiveStatusFilters.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        const set = new Set(effectiveStatusFilters);
                        if (set.has(opt.key)) set.delete(opt.key);
                        else set.add(opt.key);
                        setStatusFilters(Array.from(set));
                      }}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-800">{opt.label}</span>
                      <span className="ml-auto text-xs text-gray-500 tabular-nums">({statusCounts[opt.key] ?? 0}/{totalBaseCount})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Search - always render a search input under the selector header.
            If parent provides onSearchTermChange, call it so both inputs stay synced; otherwise use internal state. */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Lokasyon ara..."
            value={isEditing ? internalSearchTerm : effectiveSearchTerm}
            onChange={(e) => {
              const v = e.target.value;
              const pos = e.target.selectionStart ?? v.length;
              // always update internal immediately for local filtering
              setInternalSearchTerm(v);

              // do not sync to parent on every keystroke to avoid parent re-renders stealing focus.
              // We'll flush the internal value to parent on blur instead.

              // restore focus & caret after potential layout updates
              requestAnimationFrame(() => {
                const input = searchInputRef.current;
                if (input) {
                  try {
                    // Only restore the selection if this input is already focused.
                    // Calling focus() here can steal focus during typing when other
                    // components also update, so avoid it.
                    if (document.activeElement === input) {
                      input.setSelectionRange(pos, pos);
                    }
                  } catch {
                    /* ignore */
                  }
                }
              });
            }}
            onFocus={() => setIsEditing(true)}
            onBlur={() => {
              setIsEditing(false);
              // flush internal search to parent when editing ends
              if (onSearchTermChange) onSearchTermChange(internalSearchTerm);
            }}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
          />
        </div>
      </div>
      
      {/* Location List */}
      {isExpanded && (
        <div className="max-h-164 overflow-y-auto">
          <div className="p-2">
            {listContent}
          </div>
        </div>
      )}
      
      {/* Compact View - Selected Location */}
      {!isExpanded && selectedLocation && (
        <div
          onClick={() => {
            // Ensure the parent knows this location is selected so styling updates immediately
            onLocationSelect?.(selectedLocation);
            // Then open the details modal if provided
            if (onShowDetails) onShowDetails(selectedLocation);
          }}
          role="button"
          tabIndex={0}
          onMouseDown={() => setIsPressed(true)}
          onMouseUp={() => setIsPressed(false)}
          onMouseLeave={() => setIsPressed(false)}
          className={`p-3 border-t border-blue-100 cursor-pointer transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-md ${
            isPressed ? 'bg-blue-200' : 'bg-blue-100'
          }`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLocationSelect?.(selectedLocation); if (onShowDetails) onShowDetails(selectedLocation); } }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MapPin className="w-4 h-4 text-blue-600 mr-2" />
              <div>
                <p className="font-medium text-blue-900 text-sm">{selectedLocation.name}</p>
                <p className="text-xs text-blue-700">{selectedLocation.center}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {(() => {
                const st = getStatus(selectedLocation);
                return (
                  <>
                    <span className={`w-2 h-2 rounded-full ${st.dotClass}`} />
                    <span className={`text-xs font-medium ${st.colorClass}`}>{st.label}</span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationSelector;