import React, { useState, useEffect } from 'react';
import { X, Save, MapPin } from 'lucide-react';
import { Location } from '../data/regions';

interface LocationEditModalProps {
  location: Location;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedLocation: Location) => void;
  isCreate?: boolean;
  isAdmin?: boolean;
  isEditor?: boolean;
  onDelete?: (id: string) => Promise<boolean> | boolean;
}

const LocationEditModal: React.FC<LocationEditModalProps> = ({
  location,
  isOpen,
  onClose,
  onSave,
  isCreate = false,
  isAdmin = false,
  isEditor = false,
  onDelete
}) => {
  const [editedLocation, setEditedLocation] = useState<Location>(location);

  // Location prop'u değiştiğinde state'i güncelle
  useEffect(() => {
    setEditedLocation(location);
  }, [location]);

  if (!isOpen) return null;
  // Editor users should only be able to edit the `note` field.
  const handleInputChange = (field: string, value: any) => {
    if (isEditor && field !== 'note') return; // editors can only change note
    setEditedLocation(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDetailsChange = (field: string, value: any) => {
    if (isEditor) return;
    setEditedLocation(prev => ({
      ...prev,
      details: {
        ...prev.details,
        [field]: value
      }
    }));
  };

  const handleEquipmentChange = (field: string, value: number) => {
    if (isEditor) return;
    setEditedLocation(prev => ({
      ...prev,
      details: {
        ...prev.details,
        equipment: {
          ...prev.details.equipment,
          [field]: value
        }
      }
    }));
  };

  const handleCoordinateChange = (index: number, value: number) => {
    const newCoordinates: [number, number] = [...editedLocation.coordinates];
    newCoordinates[index] = value;
    setEditedLocation(prev => ({
      ...prev,
      coordinates: newCoordinates
    }));
  };

  const handleSave = () => {
    // onSave may be async in the parent; support both by checking for then
    try {
      const payload = isEditor ? { ...location, note: editedLocation.note } : editedLocation;
      const res = onSave(payload as Location) as any;
      if (res && typeof res.then === 'function') {
        res.then(() => onClose());
      } else {
        onClose();
      }
    } catch (e) {
      // onSave might throw synchronously
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const result = await onDelete(editedLocation.id);
    if (result) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <MapPin className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-bold text-gray-900">Lokasyon Düzenle</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {isEditor && (
          <div className="px-6 pt-3">
            <div className="text-sm text-gray-600">Editor yetkisi: yalnızca Not alanını düzenleyebilirsiniz. Diğer alanlar kilitli.</div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {/* Temel Bilgiler */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Temel Bilgiler</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lokasyon Adı
                </label>
                <input
                  type="text"
                  value={editedLocation.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Merkez
                </label>
                <input
                  type="text"
                  value={editedLocation.center}
                  onChange={(e) => handleInputChange('center', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enlem
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={editedLocation.coordinates[0]}
                  onChange={(e) => handleCoordinateChange(0, parseFloat(e.target.value))}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Boylam
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={editedLocation.coordinates[1]}
                  onChange={(e) => handleCoordinateChange(1, parseFloat(e.target.value))}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Adres</label>
                <textarea
                  rows={2}
                  value={editedLocation.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Örn: Deliklikaya, 34555 Arnavutköy/İstanbul"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Not</label>
                <textarea
                  rows={3}
                  value={editedLocation.note || ''}
                  onChange={(e) => handleInputChange('note', e.target.value)}
                  // Note should always be editable for editors and non-editors
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Bu lokasyon için kısa bir not ekleyin..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Marka
                </label>
                <input
                  type="text"
                  value={editedLocation.brand}
                  onChange={(e) => handleInputChange('brand', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model
                </label>
                <input
                  type="text"
                  value={editedLocation.model}
                  onChange={(e) => handleInputChange('model', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Sistem Durumu */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sistem Durumu</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="hasGPS"
                  checked={editedLocation.details.hasGPS}
                  onChange={(e) => handleDetailsChange('hasGPS', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="hasGPS" className="ml-2 text-sm font-medium text-gray-700">
                  GPS Aktif
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="hasRTU"
                  checked={editedLocation.details.hasRTU}
                  onChange={(e) => handleDetailsChange('hasRTU', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="hasRTU" className="ml-2 text-sm font-medium text-gray-700">
                  RTU Aktif
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="hasPanos"
                  checked={editedLocation.details.hasPanos}
                  onChange={(e) => handleDetailsChange('hasPanos', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="hasPanos" className="ml-2 text-sm font-medium text-gray-700">
                  Panos Aktif
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isAccepted"
                  checked={!!editedLocation.details.isAccepted}
                  onChange={(e) => handleDetailsChange('isAccepted', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isAccepted" className="ml-2 text-sm font-medium text-gray-700">
                  Kabulu Yapıldı
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isConfigured"
                  checked={editedLocation.details.isConfigured}
                  onChange={(e) => handleDetailsChange('isConfigured', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isConfigured" className="ml-2 text-sm font-medium text-gray-700">
                  Konfigüre Edildi
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isInstalled"
                  checked={!!editedLocation.details.isInstalled}
                  onChange={(e) => handleDetailsChange('isInstalled', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isInstalled" className="ml-2 text-sm font-medium text-gray-700">
                  Montajı Yapıldı(Firewall)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editedLocation.details.isActive}
                  onChange={(e) => handleDetailsChange('isActive', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm font-medium text-gray-700">
                  Devreye Alınmış(Firewall)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="hasCardAccess"
                  checked={!!editedLocation.details.hasCardAccess}
                  onChange={(e) => handleDetailsChange('hasCardAccess', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="hasCardAccess" className="ml-2 text-sm font-medium text-gray-700">
                  Kartlı Geçiş
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isInstalledCardAccess"
                  checked={!!editedLocation.details.isInstalledCardAccess}
                  onChange={(e) => handleDetailsChange('isInstalledCardAccess', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isInstalledCardAccess" className="ml-2 text-sm font-medium text-gray-700">
                  Montajı Yapıldı (Kartlı Geçiş)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActiveCardAccess"
                  checked={!!editedLocation.details.isActiveCardAccess}
                  onChange={(e) => handleDetailsChange('isActiveCardAccess', e.target.checked)}
                  disabled={isEditor}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActiveCardAccess" className="ml-2 text-sm font-medium text-gray-700">
                  Devreye Alınmış (Kartlı geçiş)
                </label>
              </div>
              
            </div>
          </div>

          {/* Ekipman Detayları */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ekipman Detayları</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Güvenlik Duvarı
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.securityFirewall}
                  onChange={(e) => handleEquipmentChange('securityFirewall', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ağ Anahtarı
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.networkSwitch}
                  onChange={(e) => handleEquipmentChange('networkSwitch', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RTU Sayısı
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.rtuCount}
                  onChange={(e) => handleEquipmentChange('rtuCount', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GPS Kart/Anten
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.gpsCardAntenna}
                  onChange={(e) => handleEquipmentChange('gpsCardAntenna', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RTU Panosu
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.rtuPanel}
                  onChange={(e) => handleEquipmentChange('rtuPanel', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  BTP Panosu
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.btpPanel}
                  onChange={(e) => handleEquipmentChange('btpPanel', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enerji Analizörü
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.energyAnalyzer}
                  onChange={(e) => handleEquipmentChange('energyAnalyzer', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  YKGC
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.ykgcCount}
                  onChange={(e) => handleEquipmentChange('ykgcCount', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  TEİAŞ RTU
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.teiasRtuInstallation}
                  onChange={(e) => handleEquipmentChange('teiasRtuInstallation', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dome Kamera
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.indoorDomeCamera}
                  onChange={(e) => handleEquipmentChange('indoorDomeCamera', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Yönetim
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.networkVideoManagement}
                  onChange={(e) => handleEquipmentChange('networkVideoManagement', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kontrol Ünitesi
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.smartControlUnit}
                  onChange={(e) => handleEquipmentChange('smartControlUnit', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kart Okuyucu
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.cardReader}
                  onChange={(e) => handleEquipmentChange('cardReader', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kayıt Ünitesi
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.networkRecordingUnit}
                  onChange={(e) => handleEquipmentChange('networkRecordingUnit', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Geçiş Kontrol
                </label>
                <input
                  type="number"
                  min="0"
                  value={editedLocation.details.equipment.accessControlSystem}
                  onChange={(e) => handleEquipmentChange('accessControlSystem', parseInt(e.target.value) || 0)}
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transformatör Merkezi Tipi
                </label>
                <input
                  type="text"
                  value={editedLocation.details.equipment.transformerCenterType || ''}
                  onChange={(e) =>
                    setEditedLocation(prev => ({
                      ...prev,
                      details: {
                        ...prev.details,
                        equipment: {
                          ...prev.details.equipment,
                          transformerCenterType: e.target.value
                        }
                      }
                    }))
                  }
                  disabled={isEditor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
          <div className="flex justify-between items-center p-6 border-t border-gray-200">
            <div>
              {!isCreate && isAdmin && (
                <button
                  onClick={() => {
                    const confirmed = window.confirm('Bu lokasyonu silmek istediğinizden emin misiniz?');
                    if (confirmed) handleDelete();
                  }}
                  className="px-3 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                >
                  Sil
                </button>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {isCreate ? 'Oluştur' : 'Kaydet'}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
};

export default LocationEditModal;