-- Apply default permissions automatically based on role
-- - On INSERT: if no explicit can_* values are provided, set them from role
-- - On UPDATE: when role changes, reset can_* to that role's defaults

CREATE OR REPLACE FUNCTION apply_role_default_permissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Handle INSERTs where permissions were not explicitly set
  IF TG_OP = 'INSERT' THEN
    IF NEW.can_view IS NULL
       AND NEW.can_edit IS NULL
       AND NEW.can_create IS NULL
       AND NEW.can_delete IS NULL
       AND NEW.can_export IS NULL
       AND NEW.can_route IS NULL
       AND NEW.can_team_view IS NULL THEN

      IF NEW.role = 'admin' THEN
        NEW.can_view := true;
        NEW.can_edit := true;
        NEW.can_create := true;
        NEW.can_delete := true;
        NEW.can_export := true;
        NEW.can_route := true;
        NEW.can_team_view := true;
      ELSIF NEW.role = 'editor' THEN
        NEW.can_view := true;
        NEW.can_edit := true;
        NEW.can_create := true;
        NEW.can_delete := false;
        NEW.can_export := true;
        NEW.can_route := true;
        NEW.can_team_view := false;
      ELSIF NEW.role = 'viewer' THEN
        NEW.can_view := false;
        NEW.can_edit := false;
        NEW.can_create := false;
        NEW.can_delete := false;
        NEW.can_export := false;
        NEW.can_route := false;
        NEW.can_team_view := false;
      ELSIF NEW.role = 'user' THEN
        NEW.can_view := false;
        NEW.can_edit := false;
        NEW.can_create := false;
        NEW.can_delete := false;
        NEW.can_export := false;
        NEW.can_route := false;
        NEW.can_team_view := false;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Handle role changes on UPDATE: always reset permissions to defaults
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.role = 'admin' THEN
      NEW.can_view := true;
      NEW.can_edit := true;
      NEW.can_create := true;
      NEW.can_delete := true;
      NEW.can_export := true;
      NEW.can_route := true;
      NEW.can_team_view := true;
    ELSIF NEW.role = 'editor' THEN
      NEW.can_view := true;
      NEW.can_edit := true;
      NEW.can_create := true;
      NEW.can_delete := false;
      NEW.can_export := true;
      NEW.can_route := true;
      NEW.can_team_view := false;
    ELSIF NEW.role = 'viewer' THEN
      NEW.can_view := false;
      NEW.can_edit := false;
      NEW.can_create := false;
      NEW.can_delete := false;
      NEW.can_export := false;
      NEW.can_route := false;
      NEW.can_team_view := false;
    ELSIF NEW.role = 'user' THEN
      NEW.can_view := false;
      NEW.can_edit := false;
      NEW.can_create := false;
      NEW.can_delete := false;
      NEW.can_export := false;
      NEW.can_route := false;
      NEW.can_team_view := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists on app_users
DROP TRIGGER IF EXISTS app_users_role_default_permissions ON app_users;

CREATE TRIGGER app_users_role_default_permissions
BEFORE INSERT OR UPDATE OF role
ON app_users
FOR EACH ROW
EXECUTE FUNCTION apply_role_default_permissions();
