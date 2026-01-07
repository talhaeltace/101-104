-- Email OTP (2FA) for custom app_users login
-- Adds login_otp_challenges table + RPCs.

-- Required for crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.login_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_otp_challenges_user_id_idx ON public.login_otp_challenges(user_id);
CREATE INDEX IF NOT EXISTS login_otp_challenges_expires_at_idx ON public.login_otp_challenges(expires_at);

ALTER TABLE public.login_otp_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.login_otp_challenges FROM anon;
REVOKE ALL ON TABLE public.login_otp_challenges FROM authenticated;

-- Create OTP challenge (service_role only). This does NOT send email.
DROP FUNCTION IF EXISTS public.create_login_otp_challenge(uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_login_otp_challenge(
  p_user_id uuid,
  p_email text,
  p_code text,
  p_ttl_seconds integer DEFAULT 600
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.login_otp_challenges(user_id, email, code_hash, expires_at)
  VALUES (
    p_user_id,
    p_email,
    crypt(p_code, gen_salt('bf')),
    now() + make_interval(secs => GREATEST(60, LEAST(p_ttl_seconds, 3600)))
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_login_otp_challenge(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_login_otp_challenge(uuid, text, text, integer) TO service_role;

-- Verify OTP and return user (anon/authenticated).
-- Returns empty result if invalid/expired/consumed/too-many-attempts.
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
  can_team_view boolean
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
    a.can_team_view
  FROM public.app_users a
  WHERE a.id = v_challenge.user_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_login_otp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login_otp(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_login_otp(uuid, text) TO authenticated;
