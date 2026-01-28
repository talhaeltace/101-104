import React from 'react';
import { MapPin, Zap, Database, Activity, CreditCard, CheckCircle2, TrendingUp } from 'lucide-react';
import { Location } from '../data/regions';

interface LocationStatsProps {
  locations: Location[]; // Tüm lokasyonlar
  selectedRegionLocations: Location[]; // Seçili bölgenin lokasyonları
}

const LocationStats: React.FC<LocationStatsProps> = ({ locations, selectedRegionLocations }) => {
  const normalizeDirectorateField = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const isDirectorateLocation = (loc: Location) =>
    normalizeDirectorateField((loc as any).brand) === 'BÖLGE' &&
    normalizeDirectorateField((loc as any).model) === 'MÜDÜRLÜK';

  const metricLocations = locations.filter(loc => !isDirectorateLocation(loc));
  const metricSelectedRegionLocations = selectedRegionLocations.filter(loc => !isDirectorateLocation(loc));

  const sumKg = (locs: Location[], predicate: (loc: Location) => boolean) =>
    locs.reduce((sum, loc) => {
      if (!predicate(loc)) return sum;
      const weight = loc.details.isTwoDoorCardAccess ? 2 : 1;
      return sum + weight;
    }, 0);

  const countKgLocations = (locs: Location[], predicate: (loc: Location) => boolean) =>
    locs.reduce((sum, loc) => (predicate(loc) ? sum + 1 : sum), 0);

  // Tüm bölgeler için istatistikler
  const activeCount = metricLocations.filter(loc => loc.details.isActive).length;
  const configuredCount = metricLocations.filter(loc => loc.details.isConfigured).length;
  const installedCount = metricLocations.filter(loc => !!loc.details.isInstalled).length;
  // NOTE: Total card access should be per-location (2-door should NOT increase total).
  const cardAccessCount = countKgLocations(metricLocations, loc => !!loc.details.hasCardAccess);
  const acceptedCount = metricLocations.filter(loc => !!loc.details.isAccepted).length;

  const getPlannedRtuCount = (loc: Location) => {
    const eq = loc.details?.equipment;
    const rtuCount = eq?.rtuCount ?? 0;
    if (rtuCount > 0) return rtuCount;
    const teias = eq?.teiasRtuInstallation ?? 0;
    if (teias > 0) return teias;
    return loc.details?.hasRTU ? 1 : 0;
  };

  // RTU counts are unit-based (rtuCount) per the requested logic.
  const rtuInstalled = metricLocations.reduce((sum, loc) => sum + (loc.details.hasRTU ? getPlannedRtuCount(loc) : 0), 0);
  const rtuTodo = metricLocations.reduce((sum, loc) => {
    if (loc.details.hasRTU) return sum;
    const planned = getPlannedRtuCount(loc);
    return sum + planned;
  }, 0);
  const rtuTotal = rtuInstalled + rtuTodo;
  
  // Seçili bölge için istatistikler
  const selectedActiveCount = metricSelectedRegionLocations.filter(loc => loc.details.isActive).length;
  const selectedConfiguredCount = metricSelectedRegionLocations.filter(loc => loc.details.isConfigured).length;
  const selectedInstalledCount = metricSelectedRegionLocations.filter(loc => !!loc.details.isInstalled).length;
  const selectedCardAccessCount = countKgLocations(metricSelectedRegionLocations, loc => !!loc.details.hasCardAccess);
  const selectedAcceptedCount = metricSelectedRegionLocations.filter(loc => !!loc.details.isAccepted).length;

  const selectedRtuInstalled = metricSelectedRegionLocations.reduce((sum, loc) => sum + (loc.details.hasRTU ? getPlannedRtuCount(loc) : 0), 0);
  const selectedRtuTodo = metricSelectedRegionLocations.reduce((sum, loc) => {
    if (loc.details.hasRTU) return sum;
    const planned = getPlannedRtuCount(loc);
    return sum + planned;
  }, 0);
  const selectedRtuTotal = selectedRtuInstalled + selectedRtuTodo;

  // Kurumsal renk paleti - sadece mavi ve gri tonları
  const stats = [
    {
      label: 'Toplam Lokasyon',
      value: metricLocations.length,
      selectedValue: metricSelectedRegionLocations.length,
      icon: MapPin,
      barColor: 'bg-blue-500',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      showPercentage: false
    },
    {
      label: 'Kabulü Yapılanlar',
      value: acceptedCount,
      selectedValue: selectedAcceptedCount,
      icon: CheckCircle2,
      barColor: 'bg-blue-500',
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      showPercentage: true
    },
    {
      label: 'Montajı Yapıldı (Firewall)',
      value: installedCount,
      selectedValue: selectedInstalledCount,
      icon: Zap,
      barColor: 'bg-blue-500',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      showPercentage: true
    },
    {
      label: 'Devreye Alınmış (Firewall)',
      value: activeCount,
      selectedValue: selectedActiveCount,
      icon: Database,
      barColor: 'bg-blue-500',
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      showPercentage: true
    },
    {
      label: 'Konfigüre Edildi',
      value: configuredCount,
      selectedValue: selectedConfiguredCount,
      icon: Activity,
      barColor: 'bg-amber-500',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      showPercentage: true
    },
    {
      label: 'Kartlı Geçiş',
      value: cardAccessCount,
      selectedValue: selectedCardAccessCount,
      icon: CreditCard,
      barColor: 'bg-blue-500',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      showPercentage: true
    },
    {
      label: 'Montajı Yapılmış (Kartlı geçiş)',
      value: sumKg(metricLocations, loc => !!loc.details.hasCardAccess && !!loc.details.isInstalledCardAccess),
      selectedValue: sumKg(metricSelectedRegionLocations, loc => !!loc.details.hasCardAccess && !!loc.details.isInstalledCardAccess),
      icon: CreditCard,
      barColor: 'bg-blue-500',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      showPercentage: true
    },
    {
      label: 'Devreye Alınmış (Kartlı geçiş)',
      value: sumKg(metricLocations, loc => !!loc.details.hasCardAccess && !!loc.details.isActiveCardAccess),
      selectedValue: sumKg(metricSelectedRegionLocations, loc => !!loc.details.hasCardAccess && !!loc.details.isActiveCardAccess),
      icon: TrendingUp,
      barColor: 'bg-blue-500',
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
      showPercentage: true
    },
    {
      label: 'RTU',
      value: rtuTotal,
      selectedValue: selectedRtuTotal,
      icon: Activity,
      barColor: 'bg-gray-400',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      showPercentage: true
    },
    {
      label: 'Kurulan RTU',
      value: rtuInstalled,
      selectedValue: selectedRtuInstalled,
      icon: CheckCircle2,
      barColor: 'bg-gray-400',
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      showPercentage: true
    },
    {
      label: 'Tamamlanacak RTU',
      value: rtuTodo,
      selectedValue: selectedRtuTodo,
      icon: Zap,
      barColor: 'bg-amber-400',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      showPercentage: true
    },
    {
      label: 'Tamamlanacak',
      value: metricLocations.length - activeCount,
      selectedValue: metricSelectedRegionLocations.length - selectedActiveCount,
      icon: Zap,
      barColor: 'bg-amber-500',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      showPercentage: true
    }
  ];

  // Yüzde hesaplama
  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 mb-6">
      {stats.map((stat, index) => {
        const totalPercentage = getPercentage(stat.value, metricLocations.length);
        const selectedPercentage = getPercentage(stat.selectedValue, metricSelectedRegionLocations.length);
        return (
          <div 
            key={index} 
            className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            {/* Üst kısım - İkon ve Seçili Bölge */}
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} strokeWidth={1.5} />
              </div>
              
              <div className="text-right">
                <div className="text-xl font-semibold text-gray-700">
                  {stat.selectedValue}
                </div>
                <div className="text-xs text-gray-400">Seçili Bölge</div>
              </div>
            </div>
            
            {/* Ana değer */}
            <div className="mb-3">
              <div className="text-3xl font-bold text-gray-800">
                {stat.value}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Toplam</div>
            </div>
            
            {/* Etiket */}
            <div className="text-sm font-medium text-gray-600 mb-3">
              {stat.label}
            </div>
            
            {/* Yüzde Bar - Toplam */}
            {stat.showPercentage && (
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Toplam</span>
                    <span className="font-medium text-gray-600">%{totalPercentage}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${stat.barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${totalPercentage}%` }}
                    />
                  </div>
                </div>
                
                {/* Yüzde Bar - Seçili Bölge */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Seçili Bölge</span>
                    <span className="font-medium text-blue-600">%{selectedPercentage}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${stat.barColor} opacity-60 rounded-full transition-all duration-500`}
                      style={{ width: `${selectedPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LocationStats;