import React, { useState, useRef } from 'react';
import { Search, MapPin, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { Location, Region } from '../data/regions';
import { fieldsMatchQuery } from '../lib/search';

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
  // optional controlled filter state
  statusFilter?: 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'accepted';
  onStatusFilterChange?: (s: 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'accepted') => void;
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
  statusFilter: statusFilterProp,
  onStatusFilterChange
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const effectiveSearchTerm = typeof searchTermProp === 'string' ? searchTermProp : internalSearchTerm;
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPressed, setIsPressed] = useState(false);
  const [internalStatusFilter, setInternalStatusFilter] = useState<'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'accepted'>('all');
  const effectiveStatusFilter = statusFilterProp ?? internalStatusFilter;
  const setStatusFilter = (s: 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'accepted') => {
    if (onStatusFilterChange) onStatusFilterChange(s);
    else setInternalStatusFilter(s);
  };

  // If an external searchTerm is provided (header search), auto-expand the selector
  // after the user pauses typing (debounced). This prevents layout thrash / scroll
  // jumps that can happen when we expand the list on every keystroke.
  React.useEffect(() => {
    if (typeof searchTermProp !== 'string') return;
    if (!searchTermProp || searchTermProp.length === 0) return;
    const t = setTimeout(() => setIsExpanded(true), 150);
    return () => clearTimeout(t);
  }, [searchTermProp]);

  const getStatus = (details: Location['details']) => {
    // Precedence: Aktif (configured + active) -> Montajlı (isInstalled) -> Konfigüre -> Eksik
    if (details.isActive && details.isConfigured) {
      return { label: 'Aktif', colorClass: 'text-green-600', dotClass: 'bg-green-500' };
    }
    if (details.isInstalled) {
      return { label: 'Montajlı', colorClass: 'text-indigo-600', dotClass: 'bg-indigo-500' };
    }
    if (details.isConfigured) {
      return { label: 'Konfigüre', colorClass: 'text-yellow-500', dotClass: 'bg-yellow-500' };
    }
    return { label: 'Eksik', colorClass: 'text-red-500', dotClass: 'bg-red-500' };
  };

  const matchesStatus = (location: Location) => {
    switch (effectiveStatusFilter) {
      case 'active':
        return !!(location.details.isActive && location.details.isConfigured);
      case 'configured':
        return !!location.details.isConfigured;
      case 'card_installed':
        return !!(location.details.hasCardAccess && location.details.isInstalledCardAccess);
      case 'card_active':
        // Use the card-specific "active" flag (isActiveCardAccess) instead of the generic isActive
        return !!(location.details.hasCardAccess && location.details.isActiveCardAccess);
      case 'card':
        return !!location.details.hasCardAccess;
      case 'notes':
        return !!(location.note && String(location.note).trim().length > 0);
      case 'installed':
        return !!location.details.isInstalled;
      case 'todo':
        // tamamlanacak = not active
        return !location.details.isActive;
      case 'missing':
        // eksik = neither configured nor active
        return !location.details.isActive && !location.details.isConfigured;
      case 'accepted':
        return !!location.details.isAccepted;
      default:
        return true;
    }
  };

  const q = effectiveSearchTerm || '';
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
              const status = getStatus(location.details);
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
            const status = getStatus(location.details);
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

        {/* Filter select */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Filtre</label>
          <select
            value={effectiveStatusFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' | 'accepted')}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
          >
                <option value="all">Tümü</option>
                <option value="accepted">Kabulü Yapılanlar</option>
                <option value="active">Devreye Alınmış</option>
                <option value="configured">Konfigüre Edildi</option>
                <option value="card">Kartlı Geçiş</option>
                <option value="installed">Montajı Yapıldı</option>
                <option value="card_installed">Montajı Yapılmış (Kartlı geçiş)</option>
                <option value="card_active">Devreye Alınmış (Kartlı geçiş)</option>
                <option value="todo">Tamamlanacak</option>
                <option value="missing">Eksik</option>
                <option value="notes">Notlar</option>
              </select>
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
                const st = getStatus(selectedLocation.details);
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