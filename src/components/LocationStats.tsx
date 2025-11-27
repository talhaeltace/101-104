import React from 'react';
import { MapPin, Zap, Database, Activity, CreditCard } from 'lucide-react';
import { Location } from '../data/regions';

interface LocationStatsProps {
  locations: Location[]; // Tüm lokasyonlar
  selectedRegionLocations: Location[]; // Seçili bölgenin lokasyonları
}

const LocationStats: React.FC<LocationStatsProps> = ({ locations, selectedRegionLocations }) => {
  // Tüm bölgeler için istatistikler
  const activeCount = locations.filter(loc => loc.details.isActive).length;
  const configuredCount = locations.filter(loc => loc.details.isConfigured).length;
  const installedCount = locations.filter(loc => !!loc.details.isInstalled).length;
  const cardAccessCount = locations.filter(loc => !!loc.details.hasCardAccess).length;
  // gpsCount and rtuCount removed: replaced by 'Tamamlanacak' and 'Devreye Alınmış' stats
  // panosCount not used in stats currently

  
  // Seçili bölge için istatistikler
  const selectedActiveCount = selectedRegionLocations.filter(loc => loc.details.isActive).length;
  const selectedConfiguredCount = selectedRegionLocations.filter(loc => loc.details.isConfigured).length;
  const selectedInstalledCount = selectedRegionLocations.filter(loc => !!loc.details.isInstalled).length;
  const selectedCardAccessCount = selectedRegionLocations.filter(loc => !!loc.details.hasCardAccess).length;
  // selectedGpsCount and selectedRtuCount removed for same reason
  // selectedPanosCount not used in stats currently

  const stats = [
    {
      label: 'Toplam Lokasyon',
      value: locations.length,
      selectedValue: selectedRegionLocations.length,
      icon: MapPin,
      color: 'bg-blue-500'
    },
    
    {
      label: 'Montajı Yapıldı (Firewall)',
      value: installedCount,
      selectedValue: selectedInstalledCount,
      icon: Zap,
      color: 'bg-indigo-500'
    },
    {
      label: 'Devreye Alınmış (Firewall)',
      value: activeCount,
      selectedValue: selectedActiveCount,
      icon: Database,
      color: 'bg-green-500'
    },
    {
      label: 'Konfigüre Edildi',
      value: configuredCount,
      selectedValue: selectedConfiguredCount,
      icon: Activity,
      color: 'bg-yellow-600'
    },
    {
      label: 'Kartlı Geçiş',
      value: cardAccessCount,
      selectedValue: selectedCardAccessCount,
      icon: CreditCard,
      color: 'bg-purple-500'
    },
    {
      label: 'Montajı Yapılmış (Kartlı geçiş)',
      value: locations.filter(loc => !!loc.details.hasCardAccess && !!loc.details.isInstalledCardAccess).length,
      selectedValue: selectedRegionLocations.filter(loc => !!loc.details.hasCardAccess && !!loc.details.isInstalledCardAccess).length,
      icon: CreditCard,
      color: 'bg-teal-500'
    },
    {
      label: 'Devreye Alınmış (Kartlı geçiş)',
      value: locations.filter(loc => !!loc.details.hasCardAccess && !!loc.details.isActiveCardAccess).length,
      selectedValue: selectedRegionLocations.filter(loc => !!loc.details.hasCardAccess && !!loc.details.isActiveCardAccess).length,
      icon: CreditCard,
      color: 'bg-emerald-500'
    },
    {
      label: 'Tamamlanacak',
      // 'Tamamlanacak' = locations that are NOT yet devreye alınmış (not active)
      value: locations.length - activeCount,
      selectedValue: selectedRegionLocations.length - selectedActiveCount,
      icon: Zap,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, index) => (
        <div key={index} className="bg-white rounded-lg shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow h-full flex items-stretch">
          <div className="flex items-center w-full">
            <div className={`${stat.color} rounded-lg p-2 flex items-center justify-center mr-4 flex-shrink-0`}>
              <stat.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight">{stat.value}</div>
                  <div className="text-sm text-gray-500 mt-1">Toplam</div>
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl text-gray-500">{stat.selectedValue}</div>
                  <div className="text-sm text-gray-400">Seçili Bölge</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-base sm:text-lg font-semibold text-gray-700">{stat.label}</div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LocationStats;