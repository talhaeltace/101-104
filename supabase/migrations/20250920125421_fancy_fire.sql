/*
  # Lokasyonlar Tablosu Oluşturma

  1. Yeni Tablolar
    - `locations`
      - Tüm lokasyon bilgileri
      - Ekipman detayları
      - Sistem durumu bilgileri
      
  2. Güvenlik
    - RLS etkinleştirildi
    - Herkese okuma/yazma izni verildi (şirket içi kullanım)
*/

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  region_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  center TEXT NOT NULL,
  latitude DECIMAL NOT NULL,
  longitude DECIMAL NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  has_gps BOOLEAN DEFAULT FALSE,
  has_rtu BOOLEAN DEFAULT FALSE,
  has_panos BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT FALSE,
  is_configured BOOLEAN DEFAULT FALSE,
  security_firewall INTEGER DEFAULT 0,
  network_switch INTEGER DEFAULT 0,
  rtu_count INTEGER DEFAULT 0,
  gps_card_antenna INTEGER DEFAULT 0,
  rtu_panel INTEGER DEFAULT 0,
  btp_panel INTEGER DEFAULT 0,
  energy_analyzer INTEGER DEFAULT 0,
  ykgc_count INTEGER DEFAULT 0,
  teias_rtu_installation INTEGER DEFAULT 0,
  indoor_dome_camera INTEGER DEFAULT 0,
  network_video_management INTEGER DEFAULT 0,
  smart_control_unit INTEGER DEFAULT 0,
  card_reader INTEGER DEFAULT 0,
  network_recording_unit INTEGER DEFAULT 0,
  access_control_system INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS'yi etkinleştir
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ADD COLUMN transformer_center_type TEXT DEFAULT NULL;

-- Herkese okuma izni ver (şirket içi kullanım)
CREATE POLICY "Herkes okuyabilir"
  ON locations
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Herkes yazabilir"
  ON locations
  FOR ALL
  TO public
  USING (true);


/* Yeni lokasyon kayıtları ekleniyor
INSERT INTO locations (
  id, region_id, name, center, latitude, longitude, brand, model,
  has_gps, has_rtu, has_panos, is_active, is_configured,
  security_firewall, network_switch, rtu_count, gps_card_antenna,
  rtu_panel, btp_panel, energy_analyzer, ykgc_count, teias_rtu_installation,
  indoor_dome_camera, network_video_management, smart_control_unit,
  card_reader, network_recording_unit, access_control_system,
  transformer_center_type
) VALUES
('biga', 1, 'BİGA', 'İZMİR', 40.22806, 27.24222, 'ABB', 'RTU560CMR01',
 false, false, false, false, false,
 0, 0, 0, 0,
 0, 0, 0, 0, 0,
 0, 0, 0,
 0, 0, 0,
 'Klasik'
),
('manyas', 1, 'MANYAS', 'İZMİR', 40.04639, 27.97000, 'ABB', 'RTU560CMR01',
 false, false, false, false, false,
 0, 0, 0, 0,
 0, 0, 0, 0, 0,
 0, 0, 0,
 0, 0, 0,
 'Klasik'
);*/