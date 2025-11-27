import React, { useState } from 'react';
import { Zap, Database, Cpu, FileText } from 'lucide-react';
import NoteModal from '../components/NoteModal';
import { Location } from '../data/regions';

interface Props {
  location: Location;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (location: Location) => void;
  isAdmin?: boolean;
  isEditor?: boolean;
}

const LocationDetailsModal: React.FC<Props> = ({ location, isOpen, onClose, onEdit, isAdmin, isEditor }) => {
  const [noteOpen, setNoteOpen] = useState(false);
  // Build a Google Maps directions/search URL using coordinates if available,
  // otherwise fall back to a search by address.
  const mapsUrl =
    location?.coordinates && location.coordinates.length === 2 && location.coordinates[0] != null && location.coordinates[1] != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${location.coordinates[0]},${location.coordinates[1]}`
      : location?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`
      : '';
  const canOpenMaps = Boolean(mapsUrl);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-lg shadow-xl overflow-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-semibold">Lokasyon Düzenle</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lokasyon Adı</label>
              <p className="text-sm text-gray-900">{location.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Merkez</label>
              <p className="text-sm text-gray-900">{location.center}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Koordinatlar</label>
              <p className="text-sm text-gray-900">{location.coordinates[0]}, {location.coordinates[1]}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-900">{location.address || '—'}</p>
                {canOpenMaps ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                    aria-label={`Yol tarifi: ${location.name}`}
                  >
                    Yol tarifi
                  </a>
                ) : null}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marka</label>
              <p className="text-sm text-gray-900">{location.brand}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <p className="text-sm text-gray-900">{location.model}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
              <div className="flex items-start justify-between">
                <div>
                  {(() => {
                    const isActive = !!location.details.isActive;
                    const isConfigured = !!location.details.isConfigured;
                    if (isActive && isConfigured) {
                      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Aktif</span>;
                    }
                    if (isConfigured) {
                      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Konfigüre Edildi</span>;
                    }
                    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Pasif</span>;
                  })()}

                  {/* {location.note && location.note.length > 0 && (
                    <div className="mt-2 text-sm text-gray-700 max-w-[22rem] truncate">
                      <span className="font-medium">Not:</span> {location.note}
                    </div>
                  )} */}
                </div>

                {location.note && location.note.length > 0 && (
                  <button onClick={() => setNoteOpen(true)} className="ml-4 p-1 text-blue-600 hover:text-blue-800" title="Notu aç">
                    <FileText className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3">Sistem Durumu</h4>
            <div className="flex flex-wrap gap-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${location.details.hasGPS ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                <Zap className="w-4 h-4 mr-1" /> GPS: {location.details.hasGPS ? 'Aktif' : 'Pasif'}
              </span>

              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${location.details.hasRTU ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                <Database className="w-4 h-4 mr-1" /> RTU: {location.details.hasRTU ? 'Aktif' : 'Pasif'}
              </span>

              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${location.details.hasPanos ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                <Cpu className="w-4 h-4 mr-1" /> Panos: {location.details.hasPanos ? 'Aktif' : 'Pasif'}
              </span>
            </div>
          </div>

          <div>
            <h4 className="text-md font-semibold text-gray-900 mb-3">Ekipman Detayları</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
              { /* Render equipment cards similarly to App's block */ }
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan Güvenlik Duvarı</p>
                <p className="text-gray-900">{location.details.equipment.securityFirewall}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan Ağ Anahtarı</p>
                <p className="text-gray-900">{location.details.equipment.networkSwitch}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan RTU Sayısı</p>
                <p className="text-gray-900">{location.details.equipment.rtuCount}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan GPS Kart/Anten</p>
                <p className="text-gray-900">{location.details.equipment.gpsCardAntenna}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan RTU Panosu</p>
                <p className="text-gray-900">{location.details.equipment.rtuPanel}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan BTP Panosu</p>
                <p className="text-gray-900">{location.details.equipment.btpPanel}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan Enerji Analizörü</p>
                <p className="text-gray-900">{location.details.equipment.energyAnalyzer}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İhtiyaç Duyulan YKGC</p>
                <p className="text-gray-900">{location.details.equipment.ykgcCount}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">TEİAŞ RTU Kurulum İhtiyacı</p>
                <p className="text-gray-900">{location.details.equipment.teiasRtuInstallation}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">İç Ortam Dome Kamera</p>
                <p className="text-gray-900">{location.details.equipment.indoorDomeCamera}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">Ağ Video Yönetim</p>
                <p className="text-gray-900">{location.details.equipment.networkVideoManagement}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">Akıllı Kontrol Ünitesi</p>
                <p className="text-gray-900">{location.details.equipment.smartControlUnit}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">Kart Okuyucu</p>
                <p className="text-gray-900">{location.details.equipment.cardReader}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">Ağ Kayıt Ünitesi</p>
                <p className="text-gray-900">{location.details.equipment.networkRecordingUnit}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">Geçiş Kontrol Sistemi</p>
                <p className="text-gray-900">{location.details.equipment.accessControlSystem}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700">Transformatör Merkez Tipi</p>
                <p className="text-gray-900">{location.details.equipment.transformerCenterType}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            {/** Show Düzenle for admins and editors (editors will be limited in the edit modal) */}
            {(isAdmin || isEditor) ? (
              <button onClick={() => onEdit(location)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 mr-3">Düzenle</button>
            ) : null}
            <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-md">Kapat</button>
          </div>
        </div>
      </div>
      {noteOpen && (
        <NoteModal isOpen={noteOpen} title={location.name + ' - Not'} note={location.note} onClose={() => setNoteOpen(false)} />
      )}
    </div>
  );
};

export default LocationDetailsModal;
