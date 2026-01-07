-- Manual GPS permission + login return fields
-- Adds can_manual_gps to app_users and exposes it through login RPCs.

BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS can_manual_gps boolean;

UPDATE public.app_users
SET can_manual_gps = false
WHERE can_manual_gps IS NULL;

ALTER TABLE public.app_users
  ALTER COLUMN can_manual_gps SET DEFAULT false;

ALTER TABLE public.app_users
  ALTER COLUMN can_manual_gps SET NOT NULL;

-- Update authenticate_app_user to include can_manual_gps
DROP FUNCTION IF EXISTS public.authenticate_app_user(text, text);

CREATE OR REPLACE FUNCTION public.authenticate_app_user(p_username text, p_password text)
RETURNS TABLE(
  id uuid,
  username text,
  role text,
  full_name text,
  email text,
  otp_required boolean,
  can_view boolean,
  can_edit boolean,
  can_create boolean,
  can_delete boolean,
  can_export boolean,
  can_route boolean,
  can_team_view boolean,
  can_manual_gps boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.username,
    a.role,
    a.full_name,
    a.email,
    a.otp_required,
    a.can_view,
    a.can_edit,
    a.can_create,
    a.can_delete,
    a.can_export,
    a.can_route,
    a.can_team_view,
    a.can_manual_gps
  FROM public.app_users a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.authenticate_app_user(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_app_user(text, text) TO authenticated;

-- Update verify_login_otp to include can_manual_gps as well
DROP FUNCTION IF EXISTS public.verify_login_otp(uuid, text);

CREATE OR REPLACE FUNCTION public.verify_login_otp(
  p_challenge_id uuid,
  p_code text
) RETURNS TABLE(
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
  can_team_view boolean,
  can_manual_gps boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_challenge public.login_otp_challenges%ROWTYPE;
BEGIN
  SELECT *
  INTO v_challenge
  FROM public.login_otp_challenges
  WHERE public.login_otp_challenges.id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_challenge.consumed_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_challenge.expires_at <= now() THEN
    RETURN;
  END IF;

  IF v_challenge.attempt_count >= 10 THEN
    RETURN;
  END IF;

  -- Always increment attempt count for any verification attempt
  UPDATE public.login_otp_challenges
  SET attempt_count = attempt_count + 1
  WHERE public.login_otp_challenges.id = v_challenge.id;

  -- Validate code
  IF crypt(p_code, v_challenge.code_hash) <> v_challenge.code_hash THEN
    RETURN;
  END IF;

  -- Mark consumed
  UPDATE public.login_otp_challenges
  SET consumed_at = now()
  WHERE public.login_otp_challenges.id = v_challenge.id;

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
    a.can_team_view,
    a.can_manual_gps
  FROM public.app_users a
  WHERE a.id = v_challenge.user_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_login_otp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login_otp(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_login_otp(uuid, text) TO authenticated;

-- Ask PostgREST (Supabase API) to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
