-- Fix PostgREST RPC resolution for admin_update_app_user by:
-- 1) Ensuring the function is created under public schema explicitly
-- 2) Providing a wrapper overload matching the exact argument-set seen from the client
-- 3) Triggering a PostgREST schema cache reload

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Canonical function (supports all optional fields)
CREATE OR REPLACE FUNCTION public.admin_update_app_user(
  p_user_id uuid,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı ID gerekli');
  END IF;

  UPDATE app_users
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
    is_active = COALESCE(p_is_active, is_active)
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

-- Wrapper overload: matches the argument set/order shown by PostgREST errors:
-- public.admin_update_app_user(p_email, p_full_name, p_is_active, p_password, p_role, p_user_id, p_username)
CREATE OR REPLACE FUNCTION public.admin_update_app_user(
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_username text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public.admin_update_app_user(
    p_user_id := p_user_id,
    p_username := p_username,
    p_password := p_password,
    p_role := p_role,
    p_email := p_email,
    p_full_name := p_full_name,
    p_phone := NULL,
    p_is_active := p_is_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_app_user(uuid, text, text, text, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_update_app_user(uuid, text, text, text, text, text, text, boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_app_user(text, text, boolean, text, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_update_app_user(text, text, boolean, text, text, uuid, text) TO authenticated;

-- Ask PostgREST (Supabase API) to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
