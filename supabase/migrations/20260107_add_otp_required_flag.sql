-- Add per-user OTP requirement toggle
-- Default behavior: OTP is required for all users unless explicitly disabled.

BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS otp_required boolean;

UPDATE public.app_users
SET otp_required = true
WHERE otp_required IS NULL;

ALTER TABLE public.app_users
  ALTER COLUMN otp_required SET DEFAULT true;

ALTER TABLE public.app_users
  ALTER COLUMN otp_required SET NOT NULL;

-- Update authenticate_app_user to also return otp_required
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
    a.otp_required,
    a.can_view,
    a.can_edit,
    a.can_create,
    a.can_delete,
    a.can_export,
    a.can_route,
    a.can_team_view
  FROM public.app_users a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.authenticate_app_user(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_app_user(text, text) TO authenticated;

-- Extend admin_update_app_user so Admin Panel can toggle otp_required
CREATE OR REPLACE FUNCTION public.admin_update_app_user(
  p_user_id uuid,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_otp_required boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı ID gerekli');
  END IF;

  UPDATE public.app_users
  SET
    username = COALESCE(p_username, username),
    password_hash = CASE
      WHEN p_password IS NULL OR length(p_password) = 0 THEN password_hash
      ELSE crypt(p_password, gen_salt('bf'))
    END,
    role = COALESCE(p_role, role),
    email = COALESCE(p_email, email),
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    is_active = COALESCE(p_is_active, is_active),
    otp_required = COALESCE(p_otp_required, otp_required)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı bulunamadı');
  END IF;

  RETURN json_build_object('success', true);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Bu kullanıcı adı veya e-posta zaten kullanılıyor');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı güncellenirken hata oluştu');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_app_user(uuid, text, text, text, text, text, text, boolean, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_update_app_user(uuid, text, text, text, text, text, text, boolean, boolean) TO authenticated;

-- Ask PostgREST (Supabase API) to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
