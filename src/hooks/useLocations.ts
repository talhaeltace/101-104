import { useState, useEffect, useCallback } from 'react';
import { regions, Region, Location } from '../data/regions';
import {
  createLocationRow,
  deleteLocationRow,
  fetchLocationRows,
  seedLocationsIfEmpty,
  updateLocationRow,
} from '../lib/apiLocations';
import { getAuthToken } from '../lib/apiClient';

export const useLocations = (opts?: { enabled?: boolean }) => {
  const enabled = opts?.enabled ?? true;
  const [locations, setLocations] = useState<Region[]>(regions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parseProjectId = useCallback((raw: unknown): string | number | undefined => {
    if (raw === null || raw === undefined) return undefined;
    const value = String(raw).trim();
    if (!value) return undefined;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
  }, []);

  const getEnvProjectId = useCallback((): string | number | undefined => {
    try {
      // Optional: allow deployments where DB enforces locations.project_id NOT NULL
      return parseProjectId((import.meta as any)?.env?.VITE_PROJECT_ID);
    } catch {
      return undefined;
    }
  }, [parseProjectId]);

  // Varsayılan verileri veritabanına kaydet
  const initializeDatabase = useCallback(async () => {
    try {
      const envProjectId = getEnvProjectId();
      const locationsToInsert = regions.flatMap(region =>
        region.locations.map(location => ({
          id: location.id,
          ...(envProjectId !== undefined ? { project_id: envProjectId } : {}),
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
          is_two_door_card_access: location.details.isTwoDoorCardAccess || false,
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
          transformer_center_type: location.details.equipment.transformerCenterType,
          is_accepted: location.details.isAccepted ?? false,
        }))
      );

      const result = await seedLocationsIfEmpty(locationsToInsert);
      if ((result.inserted ?? 0) === 0 && !result.skipped) {
        console.warn('Veritabanı seed edilmedi (inserted=0)');
      }
    } catch (err) {
      console.error('Beklenmeyen veritabanı başlatma hatası:', err);
    }
  }, [getEnvProjectId]);

  // Veritabanından verileri yükle
  const loadLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Don't call protected endpoints until auth is ready.
      if (!enabled) {
        setLocations(regions);
        return;
      }

      const token = getAuthToken();
      if (!token) {
        setLocations(regions);
        return;
      }

      const envProjectId = getEnvProjectId();
      const data = await fetchLocationRows({ projectId: envProjectId });

      if (data && data.length > 0) {
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
              isTwoDoorCardAccess: item.is_two_door_card_access ?? false,
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
        await initializeDatabase();
        setLocations(regions);
      }
    } catch (err) {
      console.error('Beklenmeyen hata:', err);
      setError('Veriler yüklenirken hata oluştu');
      setLocations(regions);
    } finally {
      setLoading(false);
    }
  }, [enabled, getEnvProjectId, initializeDatabase]);

  // Lokasyon güncelle
  const updateLocation = async (updatedLocation: Location) => {
    try {
      await updateLocationRow(updatedLocation.id, {
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
        is_two_door_card_access: updatedLocation.details.isTwoDoorCardAccess || false,
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
      });

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
      alert('Güncelleme sırasında beklenmeyen hata oluştu.');
      return false;
    }
  };

  // Lokasyon oluştur
  const createLocation = async (newLocation: Location, regionId: number) => {
    try {
      const slugify = (value: string) => {
        const map: Record<string, string> = {
          'ç': 'c', 'Ç': 'c',
          'ğ': 'g', 'Ğ': 'g',
          'ı': 'i', 'İ': 'i',
          'ö': 'o', 'Ö': 'o',
          'ş': 's', 'Ş': 's',
          'ü': 'u', 'Ü': 'u'
        };
        return String(value || '')
          .split('')
          .map(ch => (map[ch] ?? ch))
          .join('')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      };

      const baseId = newLocation?.id && String(newLocation.id).trim().length > 0
        ? String(newLocation.id).trim()
        : (() => {
            const namePart = slugify(newLocation?.name || 'lokasyon') || 'lokasyon';
            return `${namePart}-${regionId}-${Date.now()}`;
          })();

      const insertObj: any = {
        id: baseId,
        ...(getEnvProjectId() !== undefined ? { project_id: String(getEnvProjectId()) } : {}),
        region_id: regionId,
        name: newLocation.name,
        center: newLocation.center,
        latitude: newLocation.coordinates[0],
        longitude: newLocation.coordinates[1],
        brand: newLocation.brand,
        model: newLocation.model,
        has_gps: newLocation.details.hasGPS,
        has_rtu: newLocation.details.hasRTU,
        has_panos: newLocation.details.hasPanos,
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
      };

      // Optional columns (may not exist on older DB schemas)
      if (newLocation.address && String(newLocation.address).trim().length > 0) {
        insertObj.address = String(newLocation.address).trim();
      }
      if (newLocation.note && String(newLocation.note).trim().length > 0) {
        insertObj.note = String(newLocation.note).trim();
      }
      if (typeof newLocation.details.isAccepted === 'boolean') {
        insertObj.is_accepted = newLocation.details.isAccepted;
      }
      if (typeof newLocation.details.hasCardAccess === 'boolean') {
        insertObj.has_card_access = newLocation.details.hasCardAccess;
      }
      if (typeof newLocation.details.isInstalledCardAccess === 'boolean') {
        insertObj.is_installed_card_access = newLocation.details.isInstalledCardAccess;
      }
      if (typeof newLocation.details.isActiveCardAccess === 'boolean') {
        insertObj.is_active_card_access = newLocation.details.isActiveCardAccess;
      }
      if (typeof newLocation.details.isTwoDoorCardAccess === 'boolean') {
        insertObj.is_two_door_card_access = newLocation.details.isTwoDoorCardAccess;
      }
      if (typeof newLocation.details.isInstalled === 'boolean') {
        insertObj.is_installed = newLocation.details.isInstalled;
      }

      const inserted = await createLocationRow(insertObj);

      // Map inserted row back to Location shape
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
          isInstalledCardAccess: inserted.is_installed_card_access || false,
          isActiveCardAccess: inserted.is_active_card_access || false,
          isTwoDoorCardAccess: inserted.is_two_door_card_access || false,
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
      alert('Lokasyon oluşturulurken beklenmeyen hata oluştu.');
      return null;
    }
  };

  // Lokasyon sil
  const deleteLocation = async (locationId: string) => {
    try {
      await deleteLocationRow(locationId);

      setLocations(prevRegions =>
        prevRegions.map(r => ({ ...r, locations: r.locations.filter(l => l.id !== locationId) }))
      );

      return true;
    } catch (err) {
      console.error('Beklenmeyen silme hatası:', err);
      alert('Lokasyon silinirken beklenmeyen hata oluştu.');
      return false;
    }
  };

  useEffect(() => {
    if (!enabled) {
      setLocations(regions);
      setError(null);
      setLoading(false);
      return;
    }
    loadLocations();
  }, [enabled, loadLocations]);

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