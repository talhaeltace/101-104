-- Extend activities table for location arrival/completion tracking
BEGIN;

-- Add new columns for location tracking
ALTER TABLE activities 
ADD COLUMN location_id text,
ADD COLUMN location_name text,
ADD COLUMN arrival_time timestamptz,
ADD COLUMN completion_time timestamptz,
ADD COLUMN duration_minutes integer,
ADD COLUMN activity_type text CHECK (activity_type IN ('arrival', 'completion', 'general'));

-- Update existing records to have 'general' type
UPDATE activities SET activity_type = 'general' WHERE activity_type IS NULL;

-- Index for faster queries by location and type
CREATE INDEX IF NOT EXISTS idx_activities_location_id ON activities(location_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_user_time ON activities(username, created_at DESC);

COMMENT ON COLUMN activities.location_id IS 'ID of the location (if activity is location-related)';
COMMENT ON COLUMN activities.location_name IS 'Name of the location for display';
COMMENT ON COLUMN activities.arrival_time IS 'Time when user arrived at location';
COMMENT ON COLUMN activities.completion_time IS 'Time when user completed work at location';
COMMENT ON COLUMN activities.duration_minutes IS 'Duration spent at location in minutes';
COMMENT ON COLUMN activities.activity_type IS 'Type: arrival, completion, or general';

COMMIT;
