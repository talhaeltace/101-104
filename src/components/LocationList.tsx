import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Database, MapPin, Search, Zap } from 'lucide-react';
import type { Location, Region } from '../data/regions';
import { fieldsMatchQuery } from '../lib/search';

interface LocationListProps {
  locations: Location[];
  regions: Region[];
  onLocationSelect: (location: Location) => void;
  onLocationDoubleClick?: (location: Location) => void;
  onShowDetails?: (location: Location) => void;
}

const LocationList: React.FC<LocationListProps> = ({ locations, regions, onLocationSelect, onLocationDoubleClick, onShowDetails }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDirectorates, setShowDirectorates] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set()); // all collapsed by default

  const normalizeDirectorateField = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const isDirectorateLocation = (loc: Location) =>
    normalizeDirectorateField((loc as any).brand) === 'BÖLGE' &&
    normalizeDirectorateField((loc as any).model) === 'MÜDÜRLÜK';

  const regionNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of regions) map.set(r.id, r.name);
    return map;
  }, [regions]);

  const regionMetaByLocationId = useMemo(() => {
    const map = new Map<string, { regionId: number; regionName: string }>();
    for (const region of regions) {
      for (const loc of region.locations) {
        map.set(String(loc.id), { regionId: region.id, regionName: region.name });
      }
    }
    return map;
  }, [regions]);

  const getRegionMeta = (loc: Location) =>
    regionMetaByLocationId.get(String(loc.id)) ?? { regionId: 0, regionName: 'Diğer' };

  const getProgressBadge = (loc: Location) => {
    if (loc.details.isAccepted) return { label: 'Kabul', cls: 'bg-green-100 text-green-800 border-green-200' };
    if (loc.details.isInstalled) return { label: 'Kurulum', cls: 'bg-blue-100 text-blue-800 border-blue-200' };
    if (loc.details.isConfigured) return { label: 'Başlandı', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    return { label: 'Bekliyor', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  };

  const filteredLocations = locations.filter(location =>
    fieldsMatchQuery(searchTerm, location.name, location.center, location.id)
  );

  const directorateLocations = useMemo(() => filteredLocations.filter(isDirectorateLocation), [filteredLocations]);
  const nonDirectorateLocations = useMemo(() => filteredLocations.filter(l => !isDirectorateLocation(l)), [filteredLocations]);

  // Lokasyonları bölgelere göre grupla (müdürlükler hariç)
  const groupedLocations = useMemo(() => {
    const groups = new Map<number, Location[]>();

    nonDirectorateLocations.forEach(location => {
      const { regionId } = getRegionMeta(location);
      if (!groups.has(regionId)) groups.set(regionId, []);
      groups.get(regionId)!.push(location);
    });

    const sortKey = (id: number) => (id === 0 ? 999 : id);

    return Array.from(groups.entries())
      .sort(([a], [b]) => sortKey(a) - sortKey(b))
      .map(([regionId, locs]) => {
        const regionName = regionNameById.get(regionId) ?? (regionId === 0 ? 'Diğer' : `${regionId}. Bölge`);

        return {
          regionId,
          regionName,
          locations: locs,
          stats: {
            total: locs.length,
            active: locs.filter(l => l.details.isActive).length,
            configured: locs.filter(l => !l.details.isActive && l.details.isConfigured).length,
            inactive: locs.filter(l => !l.details.isActive && !l.details.isConfigured).length,
          },
        };
      });
  }, [nonDirectorateLocations, regionNameById, regionMetaByLocationId]);

  const toggleGroup = (id: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Lokasyon Listesi</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Lokasyon, merkez veya ID ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showDirectorates}
              onChange={(e) => setShowDirectorates(e.target.checked)}
            />
            Bölge Müdürlüklerini göster
          </label>
          <div className="text-xs text-gray-500 whitespace-nowrap">
            Toplam: {filteredLocations.length}
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {showDirectorates && directorateLocations.length > 0 && (() => {
          const isExpanded = expandedGroups.has(-1);
          const stats = {
            total: directorateLocations.length,
            active: directorateLocations.filter(l => l.details.isActive).length,
            configured: directorateLocations.filter(l => !l.details.isActive && l.details.isConfigured).length,
            inactive: directorateLocations.filter(l => !l.details.isActive && !l.details.isConfigured).length,
          };

          const sorted = [...directorateLocations].sort((a, b) => {
            const ra = getRegionMeta(a).regionId;
            const rb = getRegionMeta(b).regionId;
            if (ra !== rb) return ra - rb;
            return String(a.name).localeCompare(String(b.name), 'tr');
          });

          return (
            <div className="border-b border-gray-200">
              <div
                className="sticky top-0 bg-gradient-to-r from-indigo-50 to-indigo-100 px-4 py-3 cursor-pointer hover:from-indigo-100 hover:to-indigo-200 transition-colors z-10 border-b border-indigo-200"
                onClick={() => toggleGroup(-1)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-indigo-600" />
                    )}
                    <h4 className="text-sm font-bold text-indigo-900">Bölge Müdürlükleri (Merkez)</h4>
                    <span className="text-xs text-indigo-700 bg-indigo-200 px-2 py-0.5 rounded-full font-semibold">
                      {stats.total} adet
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-700">{stats.active}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-gray-700">{stats.configured}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-gray-700">{stats.inactive}</span>
                    </div>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div>
                  {sorted.map((location) => {
                    const meta = getRegionMeta(location);
                    const badge = getProgressBadge(location);
                    return (
                      <div
                        key={location.id}
                        className="p-4 border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-colors duration-150"
                        onClick={() => onShowDetails ? onShowDetails(location) : onLocationSelect(location)}
                        onDoubleClick={() => onLocationDoubleClick?.(location)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <MapPin className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                              <h4 className="font-semibold text-gray-900 text-sm truncate">{location.name}</h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">Müdürlük</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-indigo-900 border border-indigo-200 font-semibold">
                                {meta.regionName}
                              </span>
                            </div>

                            <div className="text-xs text-gray-700 mb-1.5">
                              <span className="font-medium text-gray-500">Merkez:</span> {location.center}
                            </div>

                            {location.address && (
                              <div className="text-xs text-gray-600 mb-2 truncate">
                                <span className="font-medium text-gray-500">Adres:</span> {location.address}
                              </div>
                            )}

                            <div className="flex items-center gap-3 text-xs">
                              <span className={`flex items-center gap-1 ${location.details.hasRTU ? 'text-green-600 font-medium' : 'text-red-500'}`}>
                                <Database className="w-3 h-3" /> RTU
                              </span>
                              <span className={`flex items-center gap-1 ${location.details.hasGPS ? 'text-green-600 font-medium' : 'text-red-500'}`}>
                                <Zap className="w-3 h-3" /> GPS
                              </span>
                              {location.details.hasPanos && (
                                <span className="text-blue-700 font-medium">Pano</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
                            <div className={`w-3 h-3 rounded-full ${
                              location.details.isActive
                                ? 'bg-green-500'
                                : location.details.isConfigured
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                            }`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {groupedLocations.map(({ regionId, regionName, locations: regionLocs, stats }) => {
          const isExpanded = expandedGroups.has(regionId);
          
          return (
            <div key={regionId} className="border-b border-gray-200">
              {/* Bölge Başlığı */}
              <div
                className="sticky top-0 bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 cursor-pointer hover:from-blue-100 hover:to-blue-200 transition-colors z-10 border-b border-blue-200"
                onClick={() => toggleGroup(regionId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-blue-600" />
                    )}
                    <h4 className="text-sm font-bold text-blue-900">{regionName}</h4>
                    <span className="text-xs text-blue-700 bg-blue-200 px-2 py-0.5 rounded-full font-semibold">
                      {stats.total} lokasyon
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-700">{stats.active}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-gray-700">{stats.configured}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-gray-700">{stats.inactive}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lokasyonlar */}
              {isExpanded && (
                <div>
                  {regionLocs.map((location) => (
                    <div
                      key={location.id}
                      className="p-4 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors duration-150"
                      onClick={() => onShowDetails ? onShowDetails(location) : onLocationSelect(location)}
                      onDoubleClick={() => {
                        onLocationDoubleClick?.(location);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {(() => {
                            const badge = getProgressBadge(location);
                            return (
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <MapPin className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" />
                            <h4 className="font-semibold text-gray-900 text-sm truncate">{location.name}</h4>
                                {isDirectorateLocation(location) && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                                    Müdürlük
                                  </span>
                                )}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
                              </div>
                            );
                          })()}
                          
                          <div className="text-xs text-gray-600 mb-2 flex items-center gap-2">
                            <span className="font-medium text-gray-500">Merkez:</span>
                            <span className="text-gray-700">{location.center}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-gray-500">ID:</span>
                            <span className="text-gray-700 tabular-nums">{location.id}</span>
                          </div>
                          
                          <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-700">{location.brand}</span>
                            <span className="text-gray-400">-</span>
                            <span className="text-gray-700">{location.model}</span>
                          </div>

                          {location.address && (
                            <div className="text-xs text-gray-600 mb-2 truncate">
                              <span className="font-medium text-gray-500">Adres:</span> {location.address}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-3 text-xs">
                            <span className={`flex items-center gap-1 ${location.details.hasRTU ? 'text-green-600 font-medium' : 'text-red-500'}`}>
                              <Database className="w-3 h-3" />
                              RTU
                            </span>
                            <span className={`flex items-center gap-1 ${location.details.hasGPS ? 'text-green-600 font-medium' : 'text-red-500'}`}>
                              <Zap className="w-3 h-3" />
                              GPS
                            </span>
                            {location.details.hasPanos && (
                              <span className="text-blue-700 font-medium">Pano</span>
                            )}
                            {location.details.hasCardAccess && (
                              <span className="text-purple-700 font-medium">Kartlı Geçiş</span>
                            )}
                            {location.details.isAccepted && (
                              <span className="flex items-center gap-1 text-green-600 font-semibold">
                                ✓ Kabul
                              </span>
                            )}
                            {location.details.isInstalled && !location.details.isAccepted && (
                              <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                ⚙ Kurulum
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-2 ml-3">
                          <div className={`w-3 h-3 rounded-full ${
                            location.details.isActive 
                              ? 'bg-green-500' 
                              : location.details.isConfigured 
                                ? 'bg-yellow-500' 
                                : 'bg-red-500'
                          }`} />
                          <span className="text-[10px] text-gray-500 font-medium">
                            {location.details.isActive ? 'Aktif' : location.details.isConfigured ? 'Yapım' : 'Pasif'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        
        {groupedLocations.length === 0 && (!showDirectorates || directorateLocations.length === 0) && (
          <div className="p-8 text-center text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-3 text-gray-400" />
            <p>Aradığınız kriterlere uygun lokasyon bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationList;