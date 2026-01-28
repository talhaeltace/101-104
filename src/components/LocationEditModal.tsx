import React, { useState, useEffect } from 'react';
import { X, Save, MapPin, Shield, Settings, Zap, CreditCard, Radio, Database, Cpu, Server, Activity, Monitor } from 'lucide-react';
import { Location } from '../data/regions';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface LocationEditModalProps {
  location: Location;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedLocation: Location) => void;
  isCreate?: boolean;
  isAdmin?: boolean;
  isEditor?: boolean;
  saveLabel?: string;
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
  saveLabel,
  onDelete
}) => {
  const [editedLocation, setEditedLocation] = useState<Location>(location);
  const [isDirectorateMode, setIsDirectorateMode] = useState(false);

  const normalizeDirectorateField = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const isDirectorateLocation =
    normalizeDirectorateField(editedLocation.brand) === 'BÖLGE' &&
    normalizeDirectorateField(editedLocation.model) === 'MÜDÜRLÜK';

  // In create mode this is a UI toggle; in edit/details it is derived from the saved record.
  const isMinimalDirectorateUI = (isCreate && isDirectorateMode) || (!isCreate && isDirectorateLocation);

  useBodyScrollLock(isOpen);

  // Location prop'u değiştiğinde state'i güncelle
  useEffect(() => {
    setEditedLocation(location);
    setIsDirectorateMode(false);
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

    if (field === 'isTwoDoorCardAccess' && !editedLocation.details.hasCardAccess) {
      return;
    }

    setEditedLocation(prev => ({
      ...prev,
      details: {
        ...prev.details,
        [field]: value,
        ...(field === 'hasCardAccess' && !value ? { isTwoDoorCardAccess: false } : {})
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
      if (!isEditor) {
        const nameOk = String(editedLocation.name || '').trim().length > 0;
        const centerOk = String(editedLocation.center || '').trim().length > 0;
        const lat = editedLocation.coordinates?.[0];
        const lng = editedLocation.coordinates?.[1];
        const coordsOk = Number.isFinite(lat) && Number.isFinite(lng);

        if (!nameOk || !centerOk || !coordsOk) {
          alert('Lütfen Lokasyon Adı, Konum ve Koordinatlar alanlarını doğru doldurun.');
          return;
        }
      }

      let payload: Location = isEditor ? ({ ...location, note: editedLocation.note } as Location) : editedLocation;

      if (isCreate && !isEditor && isDirectorateMode) {
        payload = {
          ...payload,
          // Ensure DB-required fields are populated without extra inputs
          brand: payload.brand?.trim() ? payload.brand : 'BÖLGE',
          model: payload.model?.trim() ? payload.model : 'MÜDÜRLÜK'
        };
      }
      const res = onSave(payload as Location) as any;
      if (res && typeof res.then === 'function') {
        res.then(() => onClose());
      } else {
        onClose();
      }
    } catch {
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

  // Status items for the grid
  const statusItems = [
    { id: 'isAccepted', label: 'Kabulü Yapıldı', checked: !!editedLocation.details.isAccepted, icon: Shield, activeColor: 'bg-green-500', activeBg: 'bg-green-50 border-green-200' },
    { id: 'isInstalled', label: 'Montaj (Firewall)', checked: !!editedLocation.details.isInstalled, icon: Settings, activeColor: 'bg-indigo-500', activeBg: 'bg-indigo-50 border-indigo-200' },
    { id: 'isConfigured', label: 'Konfigüre Edildi', checked: !!editedLocation.details.isConfigured, icon: Activity, activeColor: 'bg-amber-500', activeBg: 'bg-amber-50 border-amber-200' },
    { id: 'isActive', label: 'Devreye Alındı (FW)', checked: !!editedLocation.details.isActive, icon: Zap, activeColor: 'bg-green-500', activeBg: 'bg-green-50 border-green-200' },
    { id: 'hasCardAccess', label: 'Kartlı Geçiş', checked: !!editedLocation.details.hasCardAccess, icon: CreditCard, activeColor: 'bg-purple-500', activeBg: 'bg-purple-50 border-purple-200' },
    { id: 'isTwoDoorCardAccess', label: '2 Kapılı (KG)', checked: !!editedLocation.details.isTwoDoorCardAccess, icon: CreditCard, activeColor: 'bg-purple-500', activeBg: 'bg-purple-50 border-purple-200' },
    { id: 'isInstalledCardAccess', label: 'Montaj (Kartlı Geçiş)', checked: !!editedLocation.details.isInstalledCardAccess, icon: Settings, activeColor: 'bg-teal-500', activeBg: 'bg-teal-50 border-teal-200' },
    { id: 'isActiveCardAccess', label: 'Devreye Alındı (KG)', checked: !!editedLocation.details.isActiveCardAccess, icon: Zap, activeColor: 'bg-cyan-500', activeBg: 'bg-cyan-50 border-cyan-200' },
    { id: 'hasGPS', label: 'GPS', checked: !!editedLocation.details.hasGPS, icon: Radio, activeColor: 'bg-green-500', activeBg: 'bg-green-50 border-green-200' },
    { id: 'hasRTU', label: 'RTU', checked: !!editedLocation.details.hasRTU, icon: Database, activeColor: 'bg-green-500', activeBg: 'bg-green-50 border-green-200' },
    { id: 'hasPanos', label: 'Panos', checked: !!editedLocation.details.hasPanos, icon: Cpu, activeColor: 'bg-green-500', activeBg: 'bg-green-50 border-green-200' },
  ];

  // Equipment items for the grid
  const equipmentItems = [
    { field: 'securityFirewall', label: 'Güvenlik Duvarı', value: editedLocation.details.equipment.securityFirewall, icon: Shield },
    { field: 'networkSwitch', label: 'Ağ Anahtarı', value: editedLocation.details.equipment.networkSwitch, icon: Server },
    { field: 'rtuCount', label: 'RTU Sayısı', value: editedLocation.details.equipment.rtuCount, icon: Database },
    { field: 'gpsCardAntenna', label: 'GPS Kart/Anten', value: editedLocation.details.equipment.gpsCardAntenna, icon: Radio },
    { field: 'rtuPanel', label: 'RTU Panosu', value: editedLocation.details.equipment.rtuPanel, icon: Settings },
    { field: 'btpPanel', label: 'BTP Panosu', value: editedLocation.details.equipment.btpPanel, icon: Settings },
    { field: 'energyAnalyzer', label: 'Enerji Analizörü', value: editedLocation.details.equipment.energyAnalyzer, icon: Activity },
    { field: 'ykgcCount', label: 'YKGC', value: editedLocation.details.equipment.ykgcCount, icon: Cpu },
    { field: 'teiasRtuInstallation', label: 'TEİAŞ RTU', value: editedLocation.details.equipment.teiasRtuInstallation, icon: Settings },
    { field: 'indoorDomeCamera', label: 'Dome Kamera', value: editedLocation.details.equipment.indoorDomeCamera, icon: Monitor },
    { field: 'networkVideoManagement', label: 'Video Yönetim', value: editedLocation.details.equipment.networkVideoManagement, icon: Monitor },
    { field: 'smartControlUnit', label: 'Kontrol Ünitesi', value: editedLocation.details.equipment.smartControlUnit, icon: Cpu },
    { field: 'cardReader', label: 'Kart Okuyucu', value: editedLocation.details.equipment.cardReader, icon: CreditCard },
    { field: 'networkRecordingUnit', label: 'Kayıt Ünitesi', value: editedLocation.details.equipment.networkRecordingUnit, icon: Server },
    { field: 'accessControlSystem', label: 'Geçiş Kontrol', value: editedLocation.details.equipment.accessControlSystem, icon: Shield },
  ];

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-white w-full h-full shadow-2xl overflow-hidden flex flex-col overscroll-contain">
        
        {/* Header */}
        <div className="relative px-6 py-5 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {isCreate ? 'Yeni Lokasyon Oluştur' : 'Lokasyon Düzenle'}
                </h2>
                <p className="text-gray-500 text-sm mt-1">{editedLocation.name || 'Lokasyon bilgilerini girin'}</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {isEditor && (
            <div className="mt-3 px-3 py-2 bg-amber-100 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">⚠️ Editor yetkisi: Sadece Not alanını düzenleyebilirsiniz.</p>
            </div>
          )}
        </div>

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto p-6 space-y-6 overscroll-contain"
        >
          {/* Temel Bilgiler */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Temel Bilgiler</h3>
            {isCreate && !isEditor && (
              <label className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isDirectorateMode}
                  onChange={(e) => {
                    setIsDirectorateMode(e.target.checked);
                  }}
                  className="h-4 w-4"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Bölge Müdürlüğü (Merkez)</div>
                  <div className="text-xs text-gray-600">İşaretlersen sadece temel alanlar gösterilir.</div>
                </div>
              </label>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                  Lokasyon Adı
                </label>
                <input
                  type="text"
                  value={editedLocation.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                  Konum
                </label>
                <input
                  type="text"
                  value={editedLocation.center}
                  onChange={(e) => handleInputChange('center', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                  Enlem
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={editedLocation.coordinates[0]}
                  onChange={(e) => handleCoordinateChange(0, parseFloat(e.target.value))}
                  disabled={isEditor}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                  Boylam
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={editedLocation.coordinates[1]}
                  onChange={(e) => handleCoordinateChange(1, parseFloat(e.target.value))}
                  disabled={isEditor}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Adres</label>
                <textarea
                  rows={2}
                  value={editedLocation.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  disabled={isEditor}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50 resize-none"
                  placeholder="Örn: Deliklikaya, 34555 Arnavutköy/İstanbul"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Not</label>
                <textarea
                  rows={3}
                  value={editedLocation.note || ''}
                  onChange={(e) => handleInputChange('note', e.target.value)}
                  className="w-full px-4 py-2.5 bg-blue-50 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors resize-none"
                  placeholder="Bu lokasyon için kısa bir not ekleyin..."
                />
              </div>
              {!isMinimalDirectorateUI && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                      Marka
                    </label>
                    <input
                      type="text"
                      value={editedLocation.brand}
                      onChange={(e) => handleInputChange('brand', e.target.value)}
                      disabled={isEditor}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                      Model
                    </label>
                    <input
                      type="text"
                      value={editedLocation.model}
                      onChange={(e) => handleInputChange('model', e.target.value)}
                      disabled={isEditor}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors disabled:opacity-50"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {!isMinimalDirectorateUI && (
            <>
              {/* Sistem Durumu */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Sistem Durumu</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {statusItems.map((item) => (
                    <label 
                      key={item.id}
                      className={`relative flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        item.checked ? item.activeBg : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      } ${isEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => handleDetailsChange(item.id, e.target.checked)}
                        disabled={isEditor}
                        className="sr-only"
                      />
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        item.checked ? item.activeColor : 'bg-gray-300'
                      }`}>
                        <item.icon className="w-4 h-4 text-white" />
                      </div>
                      <span className={`text-xs font-medium leading-tight ${
                        item.checked ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Ekipman Detayları */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Ekipman Detayları</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {equipmentItems.map((item) => (
                    <div 
                      key={item.field}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        item.value > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className={`w-8 h-8 mx-auto mb-2 rounded-lg flex items-center justify-center ${
                        item.value > 0 ? 'bg-indigo-500' : 'bg-gray-300'
                      }`}>
                        <item.icon className="w-4 h-4 text-white" />
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={item.value}
                        onChange={(e) => handleEquipmentChange(item.field, parseInt(e.target.value) || 0)}
                        disabled={isEditor}
                        className="w-full text-center text-xl font-bold bg-transparent border-0 focus:ring-0 text-gray-900 disabled:opacity-50"
                      />
                      <p className="text-xs text-gray-500 mt-1 leading-tight">{item.label}</p>
                    </div>
                  ))}
                  
                  {/* Transformatör Merkezi Tipi - Text input */}
                  <div className="p-3 rounded-xl border-2 bg-gray-50 border-gray-100">
                    <div className="w-8 h-8 mx-auto mb-2 rounded-lg flex items-center justify-center bg-gray-300">
                      <Settings className="w-4 h-4 text-white" />
                    </div>
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
                      className="w-full text-center text-sm font-medium bg-transparent border-0 focus:ring-0 text-gray-900 disabled:opacity-50"
                      placeholder="—"
                    />
                    <p className="text-xs text-gray-500 mt-1 leading-tight">Merkez Tipi</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t border-gray-100 flex-shrink-0">
          <div>
            {!isCreate && isAdmin && (
              <button
                onClick={() => {
                  const confirmed = window.confirm('Bu lokasyonu silmek istediğinizden emin misiniz?');
                  if (confirmed) handleDelete();
                }}
                className="px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 rounded-xl font-medium transition-colors"
              >
                Sil
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-medium border border-gray-200 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" />
              {isCreate ? 'Oluştur' : (saveLabel || 'Kaydet')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationEditModal;