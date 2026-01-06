import React from 'react';
import { MapPin, Zap, Database, Activity, CreditCard, CheckCircle2, TrendingUp } from 'lucide-react';
import { Location } from '../data/regions';

interface LocationStatsProps {
  locations: Location[]; // Tüm lokasyonlar
  selectedRegionLocations: Location[]; // Seçili bölgenin lokasyonları
}

const LocationStats: React.FC<LocationStatsProps> = ({ locations, selectedRegionLocations }) => {
  const sumKg = (locs: Location[], predicate: (loc: Location) => boolean) =>
    locs.reduce((sum, loc) => {
      if (!predicate(loc)) return sum;
      const weight = loc.details.isTwoDoorCardAccess ? 2 : 1;
      return sum + weight;
    }, 0);

  const countKgLocations = (locs: Location[], predicate: (loc: Location) => boolean) =>
    locs.reduce((sum, loc) => (predicate(loc) ? sum + 1 : sum), 0);

  // Tüm bölgeler için istatistikler
  const activeCount = locations.filter(loc => loc.details.isActive).length;
  const configuredCount = locations.filter(loc => loc.details.isConfigured).length;
  const installedCount = locations.filter(loc => !!loc.details.isInstalled).length;
  // NOTE: Total card access should be per-location (2-door should NOT increase total).
  const cardAccessCount = countKgLocations(locations, loc => !!loc.details.hasCardAccess);
  const acceptedCount = locations.filter(loc => !!loc.details.isAccepted).length;
  
  // Seçili bölge için istatistikler
  const selectedActiveCount = selectedRegionLocations.filter(loc => loc.details.isActive).length;
  const selectedConfiguredCount = selectedRegionLocations.filter(loc => loc.details.isConfigured).length;
  const selectedInstalledCount = selectedRegionLocations.filter(loc => !!loc.details.isInstalled).length;
  const selectedCardAccessCount = countKgLocations(selectedRegionLocations, loc => !!loc.details.hasCardAccess);
  const selectedAcceptedCount = selectedRegionLocations.filter(loc => !!loc.details.isAccepted).length;

  const stats = [
    {
      label: 'Toplam Lokasyon',
      value: locations.length,
      selectedValue: selectedRegionLocations.length,
      icon: MapPin,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      showPercentage: false
    },
    {
      label: 'Kabulü Yapılanlar',
      value: acceptedCount,
      selectedValue: selectedAcceptedCount,
      icon: CheckCircle2,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600',
      showPercentage: true
    },
    {
      label: 'Montajı Yapıldı (Firewall)',
      value: installedCount,
      selectedValue: selectedInstalledCount,
      icon: Zap,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600',
      showPercentage: true
    },
    {
      label: 'Devreye Alınmış (Firewall)',
      value: activeCount,
      selectedValue: selectedActiveCount,
      icon: Database,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      showPercentage: true
    },
    {
      label: 'Konfigüre Edildi',
      value: configuredCount,
      selectedValue: selectedConfiguredCount,
      icon: Activity,
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      showPercentage: true
    },
    {
      label: 'Kartlı Geçiş',
      value: cardAccessCount,
      selectedValue: selectedCardAccessCount,
      icon: CreditCard,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      showPercentage: true
    },
    {
      label: 'Montajı Yapılmış (Kartlı geçiş)',
      value: sumKg(locations, loc => !!loc.details.hasCardAccess && !!loc.details.isInstalledCardAccess),
      selectedValue: sumKg(selectedRegionLocations, loc => !!loc.details.hasCardAccess && !!loc.details.isInstalledCardAccess),
      icon: CreditCard,
      color: 'bg-teal-500',
      textColor: 'text-teal-600',
      showPercentage: true
    },
    {
      label: 'Devreye Alınmış (Kartlı geçiş)',
      value: sumKg(locations, loc => !!loc.details.hasCardAccess && !!loc.details.isActiveCardAccess),
      selectedValue: sumKg(selectedRegionLocations, loc => !!loc.details.hasCardAccess && !!loc.details.isActiveCardAccess),
      icon: TrendingUp,
      color: 'bg-cyan-500',
      textColor: 'text-cyan-600',
      showPercentage: true
    },
    {
      label: 'Tamamlanacak',
      value: locations.length - activeCount,
      selectedValue: selectedRegionLocations.length - selectedActiveCount,
      icon: Zap,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
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
        const totalPercentage = getPercentage(stat.value, locations.length);
        const selectedPercentage = getPercentage(stat.selectedValue, selectedRegionLocations.length);
        return (
          <div 
            key={index} 
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            {/* Üst kısım - İkon ve Seçili Bölge */}
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              
              <div className="text-right">
                <div className={`text-xl font-bold ${stat.textColor}`}>
                  {stat.selectedValue}
                </div>
                <div className="text-xs text-gray-400">Seçili Bölge</div>
              </div>
            </div>
            
            {/* Ana değer */}
            <div className="mb-3">
              <div className="text-4xl font-bold text-gray-900">
                {stat.value}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Toplam</div>
            </div>
            
            {/* Etiket */}
            <div className="text-sm font-medium text-gray-700 mb-3">
              {stat.label}
            </div>
            
            {/* Yüzde Bar - Toplam */}
            {stat.showPercentage && (
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Toplam</span>
                    <span className="font-medium text-gray-700">%{totalPercentage}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                      style={{ width: `${totalPercentage}%` }}
                    />
                  </div>
                </div>
                
                {/* Yüzde Bar - Seçili Bölge */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Seçili Bölge</span>
                    <span className={`font-medium ${stat.textColor}`}>%{selectedPercentage}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${stat.color} opacity-60 rounded-full transition-all duration-500`}
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