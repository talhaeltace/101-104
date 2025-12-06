-- Add active_route column to team_status table to store route data per user
-- This replaces localStorage-based route storage

BEGIN;

-- Add active_route column (JSONB for better query support)
ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS active_route jsonb DEFAULT NULL;

-- Add current_route_index column
ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS current_route_index integer DEFAULT 0;

-- Add is_working column (for tracking work state)
ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS is_working boolean DEFAULT false;

-- Add work_start_time column
ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS work_start_time timestamptz DEFAULT NULL;

-- Update the update_team_status function to include route data
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
  p_current_lng numeric DEFAULT NULL,
  p_active_route jsonb DEFAULT NULL,
  p_current_route_index integer DEFAULT 0,
  p_is_working boolean DEFAULT false,
  p_work_start_time timestamptz DEFAULT NULL
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
    current_lat, current_lng, last_updated_at, route_started_at,
    active_route, current_route_index, is_working, work_start_time
  )
  VALUES (
    p_user_id, p_username, p_status, p_current_location_id, p_current_location_name,
    p_next_location_name, p_total_route_count, p_completed_count,
    p_current_lat, p_current_lng, now(),
    CASE WHEN p_status = 'yolda' THEN now() ELSE NULL END,
    p_active_route, p_current_route_index, p_is_working, p_work_start_time
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
    END,
    active_route = p_active_route,
    current_route_index = p_current_route_index,
    is_working = p_is_working,
    work_start_time = p_work_start_time
  RETURNING * INTO v_result;

  RETURN json_build_object('success', true, 'data', row_to_json(v_result));
END;
$$;

-- Grant execute permission for updated function
GRANT EXECUTE ON FUNCTION update_team_status(uuid, text, text, integer, text, text, integer, integer, numeric, numeric, jsonb, integer, boolean, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION update_team_status(uuid, text, text, integer, text, text, integer, integer, numeric, numeric, jsonb, integer, boolean, timestamptz) TO authenticated;

-- Create function to get user's active route
CREATE OR REPLACE FUNCTION get_user_route(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result team_status;
BEGIN
  SELECT * INTO v_result FROM team_status WHERE user_id = p_user_id;
  
  IF v_result IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  RETURN json_build_object(
    'success', true, 
    'data', json_build_object(
      'active_route', v_result.active_route,
      'current_route_index', v_result.current_route_index,
      'is_working', v_result.is_working,
      'work_start_time', v_result.work_start_time,
      'status', v_result.status
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_route(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_user_route(uuid) TO authenticated;

-- Update clear_team_status to also clear route data
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
    last_updated_at = now(),
    active_route = NULL,
    current_route_index = 0,
    is_working = false,
    work_start_time = NULL
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

COMMIT;
