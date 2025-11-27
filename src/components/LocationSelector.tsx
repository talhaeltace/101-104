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
  statusFilter?: 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active';
  onStatusFilterChange?: (s: 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active') => void;
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
  const [internalStatusFilter, setInternalStatusFilter] = useState<'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active' >('all');
  const effectiveStatusFilter = statusFilterProp ?? internalStatusFilter;
  const setStatusFilter = (s: 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active') => {
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {g.items.map(location => (
              <div
                key={`${g.region.id}-${location.id}`}
                onClick={() => {
                  onLocationSelect(location);
                  if (onShowDetails) requestAnimationFrame(() => onShowDetails(location));
                }}
                onDoubleClick={() => onLocationDoubleClick?.(location)}
                className={`p-3 border rounded-md hover:bg-blue-50 cursor-pointer transition-colors duration-150 ${
                  selectedLocation?.id === location.id ? 'bg-blue-100 border-blue-200' : 'bg-white border-gray-50'
                }`}
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-center mb-1">
                    <MapPin className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
                    <h4 className="font-medium text-gray-900 text-sm truncate">{location.name}</h4>
                  </div>

                  <div className="text-xs text-gray-600 mb-1 truncate">
                    <span className="font-medium">Merkez:</span> {location.center}
                  </div>

                  <div className="text-xs text-gray-600 mb-2 truncate">
                    <Cpu className="w-3 h-3 inline mr-1" />
                    {location.brand} - {location.model}
                  </div>

                  <div className="mt-auto flex items-center justify-between">
                    <div className="text-xs">
                      {(() => {
                        const status = getStatus(location.details);
                        return (
                          <span className={`font-medium ${status.colorClass}`}>
                            Durum: <span className={`font-normal ${status.colorClass}`}>{status.label}</span>
                          </span>
                        );
                      })()}
                    </div>

                    <div className={`w-3 h-3 rounded-full ${getStatus(location.details).dotClass}`} />
                  </div>
                </div>
              </div>
            ))}
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


        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {filteredLocations.map((location) => (
            <div
              key={location.id}
              onClick={() => {
                // make sure parent marks this as selected so the blue background shows immediately
                onLocationSelect(location);
                // then open details; use requestAnimationFrame so the selection can render before modal covers it
                if (onShowDetails) requestAnimationFrame(() => onShowDetails(location));
              }}
              onDoubleClick={() => onLocationDoubleClick?.(location)}
              className={`p-3 border rounded-md hover:bg-blue-50 cursor-pointer transition-colors duration-150 ${
                selectedLocation?.id === location.id ? 'bg-blue-100 border-blue-200' : 'bg-white border-gray-50'
              }`}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center mb-1">
                  <MapPin className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
                  <h4 className="font-medium text-gray-900 text-sm truncate">{location.name}</h4>
                </div>

                <div className="text-xs text-gray-600 mb-1 truncate">
                  <span className="font-medium">Merkez:</span> {location.center}
                </div>

                <div className="text-xs text-gray-600 mb-2 truncate">
                  <Cpu className="w-3 h-3 inline mr-1" />
                  {location.brand} - {location.model}
                </div>

                <div className="mt-auto flex items-center justify-between">
                  <div className="text-xs">
                    {/** Show a single status instead of RTU / GPS */}
                    {(() => {
                      const status = getStatus(location.details);
                      return (
                        <span className={`font-medium ${status.colorClass}`}>
                          Durum: <span className={`font-normal ${status.colorClass}`}>{status.label}</span>
                        </span>
                      );
                    })()}
                  </div>

                  <div className={`w-3 h-3 rounded-full ${getStatus(location.details).dotClass}`} />
                </div>
              </div>
            </div>
          ))}

          {filteredLocations.length === 0 && (
            <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-5 p-8 text-center text-gray-500">
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Lokasyon Seçici</h3>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <select
                value={effectiveStatusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as 'all' | 'active' | 'configured' | 'installed' | 'todo' | 'missing' | 'card' | 'notes' | 'card_installed' | 'card_active')}
                className="text-sm border border-gray-300 rounded-md px-2 py-1"
              >
                <option value="all">Tümü</option>
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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