-- Add permission columns to app_users table
-- Run this in Supabase SQL Editor

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_view boolean DEFAULT true;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_edit boolean DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_create boolean DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_delete boolean DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_export boolean DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_route boolean DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS can_team_view boolean DEFAULT false;

-- Set default permissions based on existing roles
UPDATE app_users SET 
  can_view = true,
  can_edit = true,
  can_create = true,
  can_delete = true,
  can_export = true,
  can_route = true,
  can_team_view = true
WHERE role = 'admin';

UPDATE app_users SET 
  can_view = true,
  can_edit = false,
  can_create = false,
  can_delete = false,
  can_export = true,
  can_route = true,
  can_team_view = false
WHERE role = 'editor';

UPDATE app_users SET 
  can_view = false,
  can_edit = false,
  can_create = false,
  can_delete = false,
  can_export = false,
  can_route = false,
  can_team_view = false
WHERE role = 'viewer';

UPDATE app_users SET 
  can_view = false,
  can_edit = false,
  can_create = false,
  can_delete = false,
  can_export = false,
  can_route = false,
  can_team_view = false
WHERE role = 'user';

-- Update authenticate_app_user to also return permission columns
DROP FUNCTION IF EXISTS authenticate_app_user(text, text) CASCADE;

CREATE OR REPLACE FUNCTION authenticate_app_user(p_username text, p_password text)
RETURNS TABLE(
  id uuid,
  username text,
  role text,
  full_name text,
  email text,
  can_view boolean,
  can_edit boolean,
  can_create boolean,
  can_delete boolean,
  can_export boolean,
  can_route boolean,
  can_team_view boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.username,
    a.role,
    a.full_name,
    a.email,
    a.can_view,
    a.can_edit,
    a.can_create,
    a.can_delete,
    a.can_export,
    a.can_route,
    a.can_team_view
  FROM app_users a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION authenticate_app_user(text, text) TO anon;
GRANT EXECUTE ON FUNCTION authenticate_app_user(text, text) TO authenticated;
