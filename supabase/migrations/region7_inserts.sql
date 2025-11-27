-- INSERT statements generated from 7.bölge.txt
-- Assumptions:
--  - region_id set to 7
--  - center is "KEPEZ" (first column)
--  - latitude/longitude set to KEPEZ coordinates: 36.8947, 30.7006
--  - default booleans: has_gps=false, has_rtu=false, has_panos=false, is_active=false, is_configured=true
--  - numeric columns mapped in order:
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
('bucak', 7, 'BUCAK', 'KEPEZ', 36.8947, 30.7006, 'SIEMENS', 'AK1703',
 false, false, false, false, true,
 1, 1, 1, 1,
 1, 0, 10, 2, 0,
 1, 1, 1,
 2, 0, 0,
 'Klasik'),
('burdur', 7, 'BURDUR', 'KEPEZ', 36.8947, 30.7006, 'SIEMENS', 'AK1703',
 false, false, false, false, true,
 1, 1, 1, 1,
 1, 0, 4, 2, 0,
 1, 1, 1,
 2, 0, 0,
 'Klasik'),
('akyaka', 7, 'AKYAKA', 'KEPEZ', 36.8947, 30.7006, 'ABB', 'RTU560CMR01',
 false, false, false, false, true,
 1, 1, 0, 0,
 0, 0, 0, 0, 0,
 0, 0, 0,
 0, 0, 0,
 'Otomasyonlu'),
('emirdag', 7, 'EMİRDAĞ', 'KEPEZ', 36.8947, 30.7006, 'ABB', 'RTU560CMR01',
 false, false, false, false, true,
 1, 1, 0, 0,
 0, 0, 0, 0, 0,
 0, 0, 0,
 0, 0, 0,
 'Klasik');