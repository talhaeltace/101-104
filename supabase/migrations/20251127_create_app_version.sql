-- Create app version control table
CREATE TABLE IF NOT EXISTS app_version (
  id SERIAL PRIMARY KEY,
  version_code INTEGER NOT NULL,
  version_name TEXT NOT NULL,
  apk_url TEXT NOT NULL,
  release_notes TEXT,
  is_mandatory BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial version
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, is_mandatory)
VALUES (
  1,
  '1.0.0',
  'https://drive.google.com/uc?export=download&id=1GmwmoBHqixTLRQMWVxduKT5oKjJDJV8S',
  'İlk sürüm - Harita, rota takibi, süre tutma, otomatik güncelleme özellikleri',
  false
);

UPDATE app_version 
SET version_code = 2,
    version_name = '2.0.0',
    apk_url = 'https://drive.google.com/uc?export=download&id=1GmwmoBHqixTLRQMWVxduKT5oKjJDJV8S',
    release_notes = '✨ Yeni Özellikler:
- Otomatik APK indirme
- Progress bar gösterimi
- Performans iyileştirmeleri
- Harita simgesi güncellendi',
    is_mandatory = false
WHERE id = 1;

-- Enable RLS
ALTER TABLE app_version ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read version info
CREATE POLICY "Anyone can read app version"
  ON app_version
  FOR SELECT
  USING (true);

-- Only admins can update version (if needed later)
CREATE POLICY "Only admins can update version"
  ON app_version
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.role = 'admin'
    )
  );