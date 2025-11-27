-- Add is_accepted column to locations table
ALTER TABLE locations 
ADD COLUMN is_accepted BOOLEAN DEFAULT false;

COMMENT ON COLUMN locations.is_accepted IS 'Kabulu Yapıldı - lokasyon kabulü yapıldı';
