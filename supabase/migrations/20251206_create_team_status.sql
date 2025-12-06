-- Create team_status table to track field team (editor users) real-time status
BEGIN;

CREATE TABLE IF NOT EXISTS team_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text NOT NULL,
  status text NOT NULL DEFAULT 'idle', -- idle, yolda (on the way), adreste (at address), tamamladi (completed)
  current_location_id integer, -- Current target location
  current_location_name text,
  next_location_name text,
  total_route_count integer DEFAULT 0, -- Total locations in route
  completed_count integer DEFAULT 0, -- Completed locations count
  current_lat numeric(10, 7),
  current_lng numeric(10, 7),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  route_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS team_status_user_id_idx ON team_status(user_id);
CREATE INDEX IF NOT EXISTS team_status_last_updated_idx ON team_status(last_updated_at DESC);

-- Add unique constraint on user_id to ensure one status per user
CREATE UNIQUE INDEX IF NOT EXISTS team_status_user_unique ON team_status(user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON team_status TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON team_status TO authenticated;

-- Enable real-time for this table
ALTER PUBLICATION supabase_realtime ADD TABLE team_status;

-- Create or replace function to update team status
CREATE OR REPLACE FUNCTION update_team_status(
  p_user_id uuid,
  p_username text,
  p_status text,
  p_current_location_id integer DEFAULT NULL,
  p_current_location_name text DEFAULT NULL,
  p_next_location_name text DEFAULT NULL,
  p_total_route_count integer DEFAULT 0,
  p_completed_count integer DEFAULT 0,
  p_current_lat numeric DEFAULT NULL,
  p_current_lng numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result team_status;
BEGIN
  -- Upsert team status
  INSERT INTO team_status (
    user_id, username, status, current_location_id, current_location_name,
    next_location_name, total_route_count, completed_count,
    current_lat, current_lng, last_updated_at,
    route_started_at
  )
  VALUES (
    p_user_id, p_username, p_status, p_current_location_id, p_current_location_name,
    p_next_location_name, p_total_route_count, p_completed_count,
    p_current_lat, p_current_lng, now(),
    CASE WHEN p_status = 'yolda' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = p_status,
    current_location_id = p_current_location_id,
    current_location_name = p_current_location_name,
    next_location_name = p_next_location_name,
    total_route_count = p_total_route_count,
    completed_count = p_completed_count,
    current_lat = p_current_lat,
    current_lng = p_current_lng,
    last_updated_at = now(),
    route_started_at = CASE 
      WHEN p_status = 'yolda' AND team_status.route_started_at IS NULL THEN now()
      WHEN p_status = 'idle' THEN NULL
      ELSE team_status.route_started_at
    END
  RETURNING * INTO v_result;

  RETURN json_build_object('success', true, 'data', row_to_json(v_result));
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_team_status(uuid, text, text, integer, text, text, integer, integer, numeric, numeric) TO anon;
GRANT EXECUTE ON FUNCTION update_team_status(uuid, text, text, integer, text, text, integer, integer, numeric, numeric) TO authenticated;

-- Create function to clear team status (when route is finished or cancelled)
CREATE OR REPLACE FUNCTION clear_team_status(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE team_status
  SET 
    status = 'idle',
    current_location_id = NULL,
    current_location_name = NULL,
    next_location_name = NULL,
    total_route_count = 0,
    completed_count = 0,
    route_started_at = NULL,
    last_updated_at = now()
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION clear_team_status(uuid) TO anon;
GRANT EXECUTE ON FUNCTION clear_team_status(uuid) TO authenticated;

-- Insert existing editor users into team_status
INSERT INTO team_status (user_id, username, status, total_route_count, completed_count)
SELECT id, username, 'idle', 0, 0
FROM app_users
WHERE role = 'editor'
ON CONFLICT (user_id) DO NOTHING;

-- Create trigger to auto-add editor users to team_status when they are created/updated
CREATE OR REPLACE FUNCTION sync_editor_to_team_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If user is editor, add/update team_status
  IF NEW.role = 'editor' THEN
    INSERT INTO team_status (user_id, username, status, total_route_count, completed_count)
    VALUES (NEW.id, NEW.username, 'idle', 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET username = NEW.username;
  ELSE
    -- If user is no longer editor, remove from team_status
    DELETE FROM team_status WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS sync_editor_team_status_trigger ON app_users;
CREATE TRIGGER sync_editor_team_status_trigger
AFTER INSERT OR UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION sync_editor_to_team_status();

COMMIT;
