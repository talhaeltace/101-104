-- INSERT statements generated from 6.bölge.txt
-- Assumptions:
--  - region_id set to 6
--  - center taken from first column of each row
--  - latitude/longitude set to center coordinates:
--      KEPEZ -> 36.8947, 30.7006
--      ADAPAZARI -> 40.7850, 30.4030
--  - default booleans: has_gps=false, has_rtu=false, has_panos=false, is_active=false, is_configured=true
--  - numeric columns mapped as:
--    security_firewall, network_switch, rtu_count, gps_card_antenna, rtu_panel, btp_panel,
--    energy_analyzer, ykgc_count, teias_rtu_installation, indoor_dome_camera,
--    network_video_management, smart_control_unit, card_reader, network_recording_unit, access_control_system

INSERT INTO locations (
  id, region_id, name, center, latitude, longitude, brand, model,
  has_gps, has_rtu, has_panos, is_active, is_configured,
  security_firewall, network_switch, rtu_count, gps_card_antenna,
  rtu_panel, btp_panel, energy_analyzer, ykgc_count, teias_rtu_installation,
  indoor_dome_camera, network_video_management, smart_control_unit,
  card_reader, network_recording_unit, access_control_system,
  transformer_center_type
) VALUES
('usak-osb', 6, 'UŞAK OSB', 'KEPEZ', 36.8947, 30.7006, 'SIEMENS', 'AK1703',
 false, false, false, false, true,
 1, 1, 1, 1,
 1, 0, 2, 1, 0,
 1, 1, 1,
 2, 0, 0,
 'Klasik'),
('usak-380', 6, 'UŞAK 380', 'KEPEZ', 36.8947, 30.7006, 'ABB', 'RTU560CMU02',
 false, false, false, false, true,
 1, 1, 0, 0,
 0, 0, 0, 0, 0,
 1, 1, 1,
 2, 0, 0,
 'Klasik'),
('guragac', 6, 'GÜRAĞAÇ', 'ADAPAZARI', 40.7850, 30.4030, 'ABB', 'RTU560CMR01',
 false, false, false, false, true,
 1, 1, 0, 0,
 0, 0, 0, 0, 0,
 0, 0, 0,
 0, 0, 0,
 'Klasik'),
('banaz', 6, 'BANAZ', 'KEPEZ', 36.8947, 30.7006, 'SIEMENS', 'AK3',
 false, false, false, false, true,
 1, 1, 0, 0,
 0, 0, 0, 0, 0,
 0, 0, 0,
 0, 0, 0,
 'Otomasyonlu');