import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { regions, Region, Location } from '../data/regions';

export const useLocations = () => {
  const [locations, setLocations] = useState<Region[]>(regions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Veritabanından verileri yükle
  const loadLocations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('region_id', { ascending: true });

      if (error) {
        console.error('Veri yükleme hatası:', error);
        // Hata durumunda varsayılan verileri kullan
        setLocations(regions);
        return;
      }

      if (data && data.length > 0) {
        // Veritabanından gelen verileri region formatına dönüştür
        const groupedData = data.reduce((acc: any, item: any) => {
          const regionId = item.region_id;
          if (!acc[regionId]) {
            acc[regionId] = {
              id: regionId,
              name: `${regionId}. Bölge Müdürlüğü`,
              locations: []
            };
          }
          acc[regionId].locations.push({
            id: item.id,
            name: item.name,
            center: item.center,
            coordinates: [item.latitude, item.longitude],
            address: item.address || null,
            note: item.note || null,
            brand: item.brand,
            model: item.model,
            details: {
              hasGPS: item.has_gps,
              hasRTU: item.has_rtu,
              hasPanos: item.has_panos,
                isAccepted: item.is_accepted ?? false,
                isInstalled: item.is_installed ?? false,
                hasCardAccess: item.has_card_access ?? false,
                isInstalledCardAccess: item.is_installed_card_access ?? false,
                isActiveCardAccess: item.is_active_card_access ?? false,
              isActive: item.is_active,
              isConfigured: item.is_configured,
              equipment: {
                securityFirewall: item.security_firewall || 0,
                networkSwitch: item.network_switch || 0,
                rtuCount: item.rtu_count || 0,
                gpsCardAntenna: item.gps_card_antenna || 0,
                rtuPanel: item.rtu_panel || 0,
                btpPanel: item.btp_panel || 0,
                energyAnalyzer: item.energy_analyzer || 0,
                ykgcCount: item.ykgc_count || 0,
                teiasRtuInstallation: item.teias_rtu_installation || 0,
                indoorDomeCamera: item.indoor_dome_camera || 0,
                networkVideoManagement: item.network_video_management || 0,
                smartControlUnit: item.smart_control_unit || 0,
                cardReader: item.card_reader || 0,
                networkRecordingUnit: item.network_recording_unit || 0,
                accessControlSystem: item.access_control_system || 0,
                transformerCenterType: item.transformer_center_type || null
              }
            }
          });
          return acc;
        }, {});

        const regionsArray = Object.values(groupedData) as Region[];
        setLocations(regionsArray);
      } else {
        // Veri yoksa varsayılan verileri veritabanına kaydet
        await initializeDatabase();
      }
    } catch (err) {
      console.error('Beklenmeyen hata:', err);
      setError('Veriler yüklenirken hata oluştu');
      setLocations(regions);
    } finally {
      setLoading(false);
    }
  };

  // Varsayılan verileri veritabanına kaydet
  const initializeDatabase = async () => {
    try {
      const locationsToInsert = regions.flatMap(region =>
        region.locations.map(location => ({
          id: location.id,
          region_id: region.id,
          name: location.name,
          center: location.center,
          latitude: location.coordinates[0],
          longitude: location.coordinates[1],
          address: location.address || null,
          note: location.note || null,
          brand: location.brand,
          model: location.model,
          has_gps: location.details.hasGPS,
          has_rtu: location.details.hasRTU,
          has_panos: location.details.hasPanos,
          is_installed: location.details.isInstalled || false,
          has_card_access: location.details.hasCardAccess || false,
          is_installed_card_access: location.details.isInstalledCardAccess || false,
          is_active_card_access: location.details.isActiveCardAccess || false,
          is_active: location.details.isActive,
          is_configured: location.details.isConfigured,
          security_firewall: location.details.equipment.securityFirewall,
          network_switch: location.details.equipment.networkSwitch,
          rtu_count: location.details.equipment.rtuCount,
          gps_card_antenna: location.details.equipment.gpsCardAntenna,
          rtu_panel: location.details.equipment.rtuPanel,
          btp_panel: location.details.equipment.btpPanel,
          energy_analyzer: location.details.equipment.energyAnalyzer,
          ykgc_count: location.details.equipment.ykgcCount,
          teias_rtu_installation: location.details.equipment.teiasRtuInstallation,
          indoor_dome_camera: location.details.equipment.indoorDomeCamera,
          network_video_management: location.details.equipment.networkVideoManagement,
          smart_control_unit: location.details.equipment.smartControlUnit,
          card_reader: location.details.equipment.cardReader,
          network_recording_unit: location.details.equipment.networkRecordingUnit,
          access_control_system: location.details.equipment.accessControlSystem,
          transformer_center_type: location.details.equipment.transformerCenterType || null
        }))
      );

      const { error } = await supabase
        .from('locations')
        .insert(locationsToInsert);

      if (error) {
        console.error('Veri kaydetme hatası:', error);
      } else {
        setLocations(regions);
      }
    } catch (err) {
      console.error('Veritabanı başlatma hatası:', err);
    }
  };

  // Lokasyon güncelle
  const updateLocation = async (updatedLocation: Location) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({
          name: updatedLocation.name,
          center: updatedLocation.center,
          latitude: updatedLocation.coordinates[0],
          longitude: updatedLocation.coordinates[1],
        address: updatedLocation.address || null,
          note: updatedLocation.note || null,
          brand: updatedLocation.brand,
          model: updatedLocation.model,
          has_gps: updatedLocation.details.hasGPS,
          has_rtu: updatedLocation.details.hasRTU,
          has_panos: updatedLocation.details.hasPanos,
          is_accepted: updatedLocation.details.isAccepted || false,
          has_card_access: updatedLocation.details.hasCardAccess || false,
          is_installed_card_access: updatedLocation.details.isInstalledCardAccess || false,
          is_active_card_access: updatedLocation.details.isActiveCardAccess || false,
          is_active: updatedLocation.details.isActive,
          is_configured: updatedLocation.details.isConfigured,
          is_installed: updatedLocation.details.isInstalled || false,
          security_firewall: updatedLocation.details.equipment.securityFirewall,
          network_switch: updatedLocation.details.equipment.networkSwitch,
          rtu_count: updatedLocation.details.equipment.rtuCount,
          gps_card_antenna: updatedLocation.details.equipment.gpsCardAntenna,
          rtu_panel: updatedLocation.details.equipment.rtuPanel,
          btp_panel: updatedLocation.details.equipment.btpPanel,
          energy_analyzer: updatedLocation.details.equipment.energyAnalyzer,
          ykgc_count: updatedLocation.details.equipment.ykgcCount,
          teias_rtu_installation: updatedLocation.details.equipment.teiasRtuInstallation,
          indoor_dome_camera: updatedLocation.details.equipment.indoorDomeCamera,
          network_video_management: updatedLocation.details.equipment.networkVideoManagement,
          smart_control_unit: updatedLocation.details.equipment.smartControlUnit,
          card_reader: updatedLocation.details.equipment.cardReader,
          network_recording_unit: updatedLocation.details.equipment.networkRecordingUnit,
          access_control_system: updatedLocation.details.equipment.accessControlSystem,
          transformer_center_type: updatedLocation.details.equipment.transformerCenterType || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', updatedLocation.id);

      if (error) {
        console.error('Güncelleme hatası:', error);
        setError('Güncelleme sırasında hata oluştu');
        return false;
      }

      // Local state'i güncelle
      setLocations(prevRegions =>
        prevRegions.map(region => ({
          ...region,
          locations: region.locations.map(loc =>
            loc.id === updatedLocation.id ? updatedLocation : loc
          )
        }))
      );

      return true;
    } catch (err) {
      console.error('Beklenmeyen güncelleme hatası:', err);
      setError('Güncelleme sırasında beklenmeyen hata oluştu');
      return false;
    }
  };

  // Lokasyon oluştur
  const createLocation = async (newLocation: Location, regionId: number) => {
    try {
      const insertObj: any = {
        id: newLocation.id,
        region_id: regionId,
        name: newLocation.name,
        center: newLocation.center,
        latitude: newLocation.coordinates[0],
        longitude: newLocation.coordinates[1],
  address: newLocation.address || null,
  note: newLocation.note || null,
        brand: newLocation.brand,
        model: newLocation.model,
        has_gps: newLocation.details.hasGPS,
        has_rtu: newLocation.details.hasRTU,
        has_panos: newLocation.details.hasPanos,
    is_accepted: newLocation.details.isAccepted || false,
    has_card_access: newLocation.details.hasCardAccess || false,
  is_installed_card_access: newLocation.details.isInstalledCardAccess || false,
  is_active_card_access: newLocation.details.isActiveCardAccess || false,
  is_installed: newLocation.details.isInstalled || false,
        is_active: newLocation.details.isActive,
        is_configured: newLocation.details.isConfigured,
        security_firewall: newLocation.details.equipment.securityFirewall,
        network_switch: newLocation.details.equipment.networkSwitch,
        rtu_count: newLocation.details.equipment.rtuCount,
        gps_card_antenna: newLocation.details.equipment.gpsCardAntenna,
        rtu_panel: newLocation.details.equipment.rtuPanel,
        btp_panel: newLocation.details.equipment.btpPanel,
        energy_analyzer: newLocation.details.equipment.energyAnalyzer,
        ykgc_count: newLocation.details.equipment.ykgcCount,
        teias_rtu_installation: newLocation.details.equipment.teiasRtuInstallation,
        indoor_dome_camera: newLocation.details.equipment.indoorDomeCamera,
        network_video_management: newLocation.details.equipment.networkVideoManagement,
        smart_control_unit: newLocation.details.equipment.smartControlUnit,
        card_reader: newLocation.details.equipment.cardReader,
        network_recording_unit: newLocation.details.equipment.networkRecordingUnit,
        access_control_system: newLocation.details.equipment.accessControlSystem,
        transformer_center_type: newLocation.details.equipment.transformerCenterType || null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('locations')
        .insert([insertObj])
        .select()
        .single();

      if (error) {
        console.error('Oluşturma hatası:', error);
        setError('Lokasyon oluşturulurken hata oluştu');
        return null;
      }

      // Map inserted row back to Location shape
      const inserted = data as any;
      const locationObj: Location = {
        id: inserted.id,
        name: inserted.name,
        center: inserted.center,
        coordinates: [inserted.latitude, inserted.longitude],
        address: inserted.address || null,
        note: inserted.note || null,
        brand: inserted.brand,
        model: inserted.model,
        details: {
          hasGPS: inserted.has_gps,
          hasRTU: inserted.has_rtu,
          hasPanos: inserted.has_panos,
          isAccepted: inserted.is_accepted || false,
          isActive: inserted.is_active,
          isConfigured: inserted.is_configured,
          isInstalled: inserted.is_installed || false,
          hasCardAccess: inserted.has_card_access || false,
          isActiveCardAccess: inserted.is_active_card_access || false,
          equipment: {
            securityFirewall: inserted.security_firewall || 0,
            networkSwitch: inserted.network_switch || 0,
            rtuCount: inserted.rtu_count || 0,
            gpsCardAntenna: inserted.gps_card_antenna || 0,
            rtuPanel: inserted.rtu_panel || 0,
            btpPanel: inserted.btp_panel || 0,
            energyAnalyzer: inserted.energy_analyzer || 0,
            ykgcCount: inserted.ykgc_count || 0,
            teiasRtuInstallation: inserted.teias_rtu_installation || 0,
            indoorDomeCamera: inserted.indoor_dome_camera || 0,
            networkVideoManagement: inserted.network_video_management || 0,
            smartControlUnit: inserted.smart_control_unit || 0,
            cardReader: inserted.card_reader || 0,
            networkRecordingUnit: inserted.network_recording_unit || 0,
            accessControlSystem: inserted.access_control_system || 0,
            transformerCenterType: inserted.transformer_center_type || null
          },
          tags: ''
        }
      };

      // Update local grouped state
      setLocations(prevRegions => {
        const found = prevRegions.find(r => r.id === regionId);
        if (found) {
          return prevRegions.map(r => r.id === regionId ? { ...r, locations: [...r.locations, locationObj] } : r);
        }
        // if region not found, add it
        return [...prevRegions, { id: regionId, name: `${regionId}. Bölge Müdürlüğü`, locations: [locationObj] }];
      });

      return locationObj;
    } catch (err) {
      console.error('Beklenmeyen oluşturma hatası:', err);
      setError('Lokasyon oluşturulurken beklenmeyen hata oluştu');
      return null;
    }
  };

  // Lokasyon sil
  const deleteLocation = async (locationId: string) => {
    try {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', locationId);

      if (error) {
        console.error('Silme hatası:', error);
        setError('Lokasyon silinirken hata oluştu');
        return false;
      }

      setLocations(prevRegions =>
        prevRegions.map(r => ({ ...r, locations: r.locations.filter(l => l.id !== locationId) }))
      );

      return true;
    } catch (err) {
      console.error('Beklenmeyen silme hatası:', err);
      setError('Lokasyon silinirken beklenmeyen hata oluştu');
      return false;
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  return {
    locations,
    loading,
    error,
    updateLocation,
    createLocation,
    deleteLocation,
    refreshLocations: loadLocations
  };
};