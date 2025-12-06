-- Detailed team tracking: track completed locations, time spent, history
-- This migration adds detailed tracking for team members

BEGIN;

-- Add detailed tracking columns to team_status
ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS completed_locations jsonb DEFAULT '[]'::jsonb; -- Array of completed location objects with timing

ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS current_leg_start_time timestamptz DEFAULT NULL; -- When current travel/work started

ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS total_travel_minutes integer DEFAULT 0; -- Total minutes spent traveling

ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS total_work_minutes integer DEFAULT 0; -- Total minutes spent working

ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS today_completed_count integer DEFAULT 0; -- Completed locations today (doesn't reset on cancel)

ALTER TABLE team_status 
ADD COLUMN IF NOT EXISTS today_started_at timestamptz DEFAULT NULL; -- When today's work started

-- Update the update_team_status function with new parameters
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
  p_work_start_time timestamptz DEFAULT NULL,
  p_completed_locations jsonb DEFAULT NULL,
  p_current_leg_start_time timestamptz DEFAULT NULL,
  p_total_travel_minutes integer DEFAULT NULL,
  p_total_work_minutes integer DEFAULT NULL,
  p_today_completed_count integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result team_status;
  v_existing team_status;
BEGIN
  -- Get existing record to preserve values if not provided
  SELECT * INTO v_existing FROM team_status WHERE user_id = p_user_id;
  
  -- Upsert team status
  INSERT INTO team_status (
    user_id, username, status, current_location_id, current_location_name,
    next_location_name, total_route_count, completed_count,
    current_lat, current_lng, last_updated_at, route_started_at,
    active_route, current_route_index, is_working, work_start_time,
    completed_locations, current_leg_start_time, total_travel_minutes, 
    total_work_minutes, today_completed_count, today_started_at
  )
  VALUES (
    p_user_id, p_username, p_status, p_current_location_id, p_current_location_name,
    p_next_location_name, p_total_route_count, p_completed_count,
    p_current_lat, p_current_lng, now(),
    CASE WHEN p_status = 'yolda' AND (v_existing IS NULL OR v_existing.route_started_at IS NULL) THEN now() ELSE COALESCE(v_existing.route_started_at, NULL) END,
    COALESCE(p_active_route, v_existing.active_route),
    p_current_route_index,
    p_is_working,
    p_work_start_time,
    COALESCE(p_completed_locations, v_existing.completed_locations, '[]'::jsonb),
    p_current_leg_start_time,
    COALESCE(p_total_travel_minutes, v_existing.total_travel_minutes, 0),
    COALESCE(p_total_work_minutes, v_existing.total_work_minutes, 0),
    COALESCE(p_today_completed_count, v_existing.today_completed_count, 0),
    CASE 
      WHEN v_existing IS NULL OR v_existing.today_started_at IS NULL OR v_existing.today_started_at::date < CURRENT_DATE 
      THEN now() 
      ELSE v_existing.today_started_at 
    END
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
      WHEN p_status = 'idle' AND p_active_route IS NULL THEN NULL
      ELSE team_status.route_started_at
    END,
    active_route = COALESCE(p_active_route, team_status.active_route),
    current_route_index = p_current_route_index,
    is_working = p_is_working,
    work_start_time = p_work_start_time,
    completed_locations = COALESCE(p_completed_locations, team_status.completed_locations, '[]'::jsonb),
    current_leg_start_time = p_current_leg_start_time,
    total_travel_minutes = COALESCE(p_total_travel_minutes, team_status.total_travel_minutes, 0),
    total_work_minutes = COALESCE(p_total_work_minutes, team_status.total_work_minutes, 0),
    today_completed_count = COALESCE(p_today_completed_count, team_status.today_completed_count, 0),
    today_started_at = CASE 
      WHEN team_status.today_started_at IS NULL OR team_status.today_started_at::date < CURRENT_DATE 
      THEN now() 
      ELSE team_status.today_started_at 
    END
  RETURNING * INTO v_result;

  RETURN json_build_object('success', true, 'data', row_to_json(v_result));
END;
$$;

-- Grant execute permission for updated function
GRANT EXECUTE ON FUNCTION update_team_status(uuid, text, text, integer, text, text, integer, integer, numeric, numeric, jsonb, integer, boolean, timestamptz, jsonb, timestamptz, integer, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION update_team_status(uuid, text, text, integer, text, text, integer, integer, numeric, numeric, jsonb, integer, boolean, timestamptz, jsonb, timestamptz, integer, integer, integer) TO authenticated;

-- Update get_user_route to include new fields
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
      'status', v_result.status,
      'completed_locations', v_result.completed_locations,
      'current_leg_start_time', v_result.current_leg_start_time,
      'total_travel_minutes', v_result.total_travel_minutes,
      'total_work_minutes', v_result.total_work_minutes,
      'today_completed_count', v_result.today_completed_count,
      'today_started_at', v_result.today_started_at,
      'route_started_at', v_result.route_started_at
    )
  );
END;
$$;

-- Update clear_team_status to preserve today's completed count
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
    work_start_time = NULL,
    current_leg_start_time = NULL
    -- NOT clearing: completed_locations, total_travel_minutes, total_work_minutes, today_completed_count, today_started_at
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Create function to reset daily stats (can be called at midnight or on first login of day)
CREATE OR REPLACE FUNCTION reset_daily_team_stats(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE team_status
  SET 
    completed_locations = '[]'::jsonb,
    total_travel_minutes = 0,
    total_work_minutes = 0,
    today_completed_count = 0,
    today_started_at = NULL
  WHERE user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reset_daily_team_stats(uuid) TO anon;
GRANT EXECUTE ON FUNCTION reset_daily_team_stats(uuid) TO authenticated;

COMMIT;
