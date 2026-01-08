import React, { useState } from 'react';
import { MapPin, Zap, Database, Cpu, FileText, Navigation, X, Settings, Radio, Shield, Monitor, CreditCard, Server, Activity } from 'lucide-react';
import NoteModal from '../components/NoteModal';
import { Location } from '../data/regions';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface Props {
  location: Location;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (location: Location) => void;
  isAdmin?: boolean;
  isEditor?: boolean;
  isViewer?: boolean;
  canEdit?: boolean;
}

const LocationDetailsModal: React.FC<Props> = ({ location, isOpen, onClose, onEdit, isAdmin, isEditor, isViewer, canEdit }) => {
  const [noteOpen, setNoteOpen] = useState(false);

  useBodyScrollLock(isOpen);

  const canEditLocation = (typeof canEdit === 'boolean' ? canEdit : !!(isAdmin || isEditor)) && !isViewer;

  const normalizeDirectorateField = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const isMinimalDirectorateUI =
    normalizeDirectorateField(location.brand) === 'BÖLGE' &&
    normalizeDirectorateField(location.model) === 'MÜDÜRLÜK';
  
  const mapsUrl =
    location?.coordinates && location.coordinates.length === 2 && location.coordinates[0] != null && location.coordinates[1] != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${location.coordinates[0]},${location.coordinates[1]}`
      : location?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`
      : '';
  const canOpenMaps = Boolean(mapsUrl);

  if (!isOpen) return null;

  // Status helper
  const getStatusInfo = () => {
    if (location.details.isAccepted) {
      return { label: 'Kabul Edildi', color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' };
    }
    if (location.details.isInstalled) {
      return { label: 'Kurulum Tamam (Kabul Bekliyor)', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' };
    }
    if (location.details.isConfigured) {
      return { label: 'Başlandı (Ring)', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
    }
    return { label: 'Hiç Girilmedi', color: 'bg-amber-800', textColor: 'text-amber-900', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
  };

  const status = getStatusInfo();

  // Equipment data for cleaner rendering
  const equipmentItems = [
    { label: 'Güvenlik Duvarı', value: location.details.equipment.securityFirewall, icon: Shield },
    { label: 'Ağ Anahtarı', value: location.details.equipment.networkSwitch, icon: Server },
    { label: 'RTU Sayısı', value: location.details.equipment.rtuCount, icon: Database },
    { label: 'GPS Kart/Anten', value: location.details.equipment.gpsCardAntenna, icon: Radio },
    { label: 'RTU Panosu', value: location.details.equipment.rtuPanel, icon: Settings },
    { label: 'BTP Panosu', value: location.details.equipment.btpPanel, icon: Settings },
    { label: 'Enerji Analizörü', value: location.details.equipment.energyAnalyzer, icon: Activity },
    { label: 'YKGC', value: location.details.equipment.ykgcCount, icon: Cpu },
    { label: 'TEİAŞ RTU Kurulum', value: location.details.equipment.teiasRtuInstallation, icon: Settings },
    { label: 'Dome Kamera', value: location.details.equipment.indoorDomeCamera, icon: Monitor },
    { label: 'Video Yönetim', value: location.details.equipment.networkVideoManagement, icon: Monitor },
    { label: 'Akıllı Kontrol', value: location.details.equipment.smartControlUnit, icon: Cpu },
    { label: 'Kart Okuyucu', value: location.details.equipment.cardReader, icon: CreditCard },
    { label: 'Kayıt Ünitesi', value: location.details.equipment.networkRecordingUnit, icon: Server },
    { label: 'Geçiş Kontrol', value: location.details.equipment.accessControlSystem, icon: Shield },
  ];

  return (
    <div className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white w-full h-full overflow-hidden flex flex-col overscroll-contain">
        
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-slate-800 bg-slate-900 text-white flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Status indicator */}
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-white" />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold">{location.name}</h2>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${status.bgColor} ${status.textColor} border ${status.borderColor}`}>
                    {status.label}
                  </span>
                </div>
                <span className="text-sm text-white/70">{location.center}</span>
              </div>
            </div>
            
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/80" />
            </button>
          </div>

          {/* Note button if exists */}
          {location.note && location.note.length > 0 && (
            <button 
              onClick={() => setNoteOpen(true)} 
              className="absolute bottom-3 right-6 flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm font-medium text-white transition-colors"
            >
              <FileText className="w-4 h-4" />
              Notu Görüntüle
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 overscroll-contain">
          
          {/* Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {!isViewer && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Koordinatlar</p>
                <p className="text-sm font-semibold text-gray-900">{location.coordinates[0]}, {location.coordinates[1]}</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Marka</p>
              <p className="text-sm font-semibold text-gray-900">{location.brand}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Model</p>
              <p className="text-sm font-semibold text-gray-900">{location.model}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Merkez Tipi</p>
              <p className="text-sm font-semibold text-gray-900">{location.details.equipment.transformerCenterType || '—'}</p>
            </div>
          </div>

          {/* Address with directions - hidden for viewers */}
          {!isViewer && (location.address || canOpenMaps) && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-600 uppercase tracking-wide mb-1">Adres</p>
                <p className="text-sm font-medium text-gray-900">{location.address || 'Adres girilmemiş'}</p>
              </div>
              {canOpenMaps && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Navigation className="w-4 h-4" />
                  Yol Tarifi
                </a>
              )}
            </div>
          )}

          {/* System Status */}
          {!isMinimalDirectorateUI && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Sistem Durumu</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {/* Kabulü Yapıldı */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isAccepted ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isAccepted ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Kabulü Yapıldı</p>
                  <p className={`text-sm font-semibold ${location.details.isAccepted ? 'text-green-700' : 'text-gray-500'}`}>
                    {location.details.isAccepted ? 'Evet' : 'Hayır'}
                  </p>
                </div>
              </div>

              {/* Montajı Yapıldı (Firewall) */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isInstalled ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isInstalled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <Settings className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Montaj (FW)</p>
                  <p className={`text-sm font-semibold ${location.details.isInstalled ? 'text-indigo-700' : 'text-gray-500'}`}>
                    {location.details.isInstalled ? 'Yapıldı' : 'Yapılmadı'}
                  </p>
                </div>
              </div>

              {/* Konfigüre Edildi */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isConfigured ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isConfigured ? 'bg-amber-500' : 'bg-gray-300'}`}>
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Konfigüre</p>
                  <p className={`text-sm font-semibold ${location.details.isConfigured ? 'text-amber-700' : 'text-gray-500'}`}>
                    {location.details.isConfigured ? 'Edildi' : 'Edilmedi'}
                  </p>
                </div>
              </div>

              {/* Devreye Alındı (Firewall) */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Devreye (FW)</p>
                  <p className={`text-sm font-semibold ${location.details.isActive ? 'text-green-700' : 'text-gray-500'}`}>
                    {location.details.isActive ? 'Alındı' : 'Alınmadı'}
                  </p>
                </div>
              </div>

              {/* Kartlı Geçiş */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.hasCardAccess ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.hasCardAccess ? 'bg-purple-500' : 'bg-gray-300'}`}>
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Kartlı Geçiş</p>
                  <p className={`text-sm font-semibold ${location.details.hasCardAccess ? 'text-purple-700' : 'text-gray-500'}`}>
                    {location.details.hasCardAccess ? 'Var' : 'Yok'}
                  </p>
                </div>
              </div>

              {/* 2 Kapılı (Kartlı Geçiş) */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isTwoDoorCardAccess ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isTwoDoorCardAccess ? 'bg-purple-500' : 'bg-gray-300'}`}>
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">2 Kapılı (KG)</p>
                  <p className={`text-sm font-semibold ${location.details.isTwoDoorCardAccess ? 'text-purple-700' : 'text-gray-500'}`}>
                    {location.details.isTwoDoorCardAccess ? 'Evet' : 'Hayır'}
                  </p>
                </div>
              </div>

              {/* Montajı Yapıldı (Kartlı Geçiş) */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isInstalledCardAccess ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isInstalledCardAccess ? 'bg-teal-500' : 'bg-gray-300'}`}>
                  <Settings className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Montaj (KG)</p>
                  <p className={`text-sm font-semibold ${location.details.isInstalledCardAccess ? 'text-teal-700' : 'text-gray-500'}`}>
                    {location.details.isInstalledCardAccess ? 'Yapıldı' : 'Yapılmadı'}
                  </p>
                </div>
              </div>

              {/* Devreye Alındı (Kartlı Geçiş) */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.isActiveCardAccess ? 'bg-cyan-50 border-cyan-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.isActiveCardAccess ? 'bg-cyan-500' : 'bg-gray-300'}`}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Devreye (KG)</p>
                  <p className={`text-sm font-semibold ${location.details.isActiveCardAccess ? 'text-cyan-700' : 'text-gray-500'}`}>
                    {location.details.isActiveCardAccess ? 'Alındı' : 'Alınmadı'}
                  </p>
                </div>
              </div>

              {/* GPS */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.hasGPS ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.hasGPS ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <Radio className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">GPS</p>
                  <p className={`text-sm font-semibold ${location.details.hasGPS ? 'text-green-700' : 'text-gray-500'}`}>
                    {location.details.hasGPS ? 'Aktif' : 'Pasif'}
                  </p>
                </div>
              </div>

              {/* RTU */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.hasRTU ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.hasRTU ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <Database className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">RTU</p>
                  <p className={`text-sm font-semibold ${location.details.hasRTU ? 'text-green-700' : 'text-gray-500'}`}>
                    {location.details.hasRTU ? 'Aktif' : 'Pasif'}
                  </p>
                </div>
              </div>

              {/* Panos */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 ${location.details.hasPanos ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${location.details.hasPanos ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">Panos</p>
                  <p className={`text-sm font-semibold ${location.details.hasPanos ? 'text-green-700' : 'text-gray-500'}`}>
                    {location.details.hasPanos ? 'Aktif' : 'Pasif'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Equipment Grid */}
          {!isMinimalDirectorateUI && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Ekipman Detayları</h3>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {equipmentItems.map((item, index) => (
                <div 
                  key={index} 
                  className={`relative p-3 rounded-xl border-2 text-center transition-colors ${
                    item.value > 0 
                      ? 'bg-indigo-50 border-indigo-200' 
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div className={`w-8 h-8 mx-auto mb-2 rounded-lg flex items-center justify-center ${
                    item.value > 0 ? 'bg-indigo-500' : 'bg-gray-300'
                  }`}>
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  <p className={`text-2xl font-bold ${item.value > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>
                    {item.value}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 leading-tight">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          {canEditLocation && (
            <button 
              onClick={() => onEdit(location)} 
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              Düzenle
            </button>
          )}
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-medium border border-gray-200 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>

      {noteOpen && (
        <NoteModal isOpen={noteOpen} title={location.name + ' - Not'} note={location.note} onClose={() => setNoteOpen(false)} />
      )}
    </div>
  );
};

export default LocationDetailsModal;
