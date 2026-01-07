-- Fix admin_create_app_user RPC signature and schema cache issues
-- Ensures the function exists in public schema with expected named parameters.

BEGIN;

-- Required for crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_create_app_user(
  p_username text,
  p_password text,
  p_role text DEFAULT 'user',
  p_email text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_role := COALESCE(NULLIF(trim(p_role), ''), 'user');

  IF p_username IS NULL OR length(trim(p_username)) < 3 THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı adı en az 3 karakter olmalıdır');
  END IF;

  IF p_password IS NULL OR length(p_password) < 4 THEN
    RETURN json_build_object('success', false, 'error', 'Parola en az 4 karakter olmalıdır');
  END IF;

  INSERT INTO public.app_users (
    username,
    password_hash,
    role,
    email,
    full_name,
    phone,
    is_active,
    can_view,
    can_edit,
    can_create,
    can_delete,
    can_export,
    can_route,
    can_team_view,
    can_manual_gps
  )
  VALUES (
    trim(p_username),
    crypt(p_password, gen_salt('bf')),
    v_role,
    p_email,
    p_full_name,
    p_phone,
    true,
    CASE WHEN v_role IN ('admin', 'editor') THEN true ELSE false END,
    CASE WHEN v_role = 'admin' THEN true ELSE false END,
    CASE WHEN v_role = 'admin' THEN true ELSE false END,
    CASE WHEN v_role = 'admin' THEN true ELSE false END,
    CASE WHEN v_role IN ('admin', 'editor') THEN true ELSE false END,
    CASE WHEN v_role IN ('admin', 'editor') THEN true ELSE false END,
    CASE WHEN v_role = 'admin' THEN true ELSE false END,
    false
  )
  RETURNING id INTO v_user_id;

  RETURN json_build_object('success', true, 'user_id', v_user_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Bu kullanıcı adı veya e-posta zaten kullanılıyor');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı oluşturulurken hata oluştu');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_app_user(text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_create_app_user(text, text, text, text, text, text) TO authenticated;

-- Ask PostgREST (Supabase API) to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
