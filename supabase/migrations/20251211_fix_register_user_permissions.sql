-- Ensure newly registered users get explicit permission flags
-- Run this in Supabase SQL Editor after previous migrations

-- Recreate register_app_user to also set permission columns
CREATE OR REPLACE FUNCTION register_app_user(
  p_username text,
  p_password text,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_existing_user uuid;
BEGIN
  -- Check if username already exists
  SELECT id INTO v_existing_user FROM app_users WHERE username = p_username;
  IF v_existing_user IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bu kullanıcı adı zaten kullanılıyor');
  END IF;

  -- Check if email already exists (if provided)
  IF p_email IS NOT NULL THEN
    SELECT id INTO v_existing_user FROM app_users WHERE email = p_email;
    IF v_existing_user IS NOT NULL THEN
      RETURN json_build_object('success', false, 'error', 'Bu e-posta adresi zaten kullanılıyor');
    END IF;
  END IF;

  -- Validate password length
  IF length(p_password) < 4 THEN
    RETURN json_build_object('success', false, 'error', 'Parola en az 4 karakter olmalıdır');
  END IF;

  -- Insert new user with 'viewer' role and EXPLICITLY NO PERMISSIONS
  INSERT INTO app_users (
    username,
    password_hash,
    role,
    full_name,
    email,
    can_view,
    can_edit,
    can_create,
    can_delete,
    can_export,
    can_route,
    can_team_view
  )
  VALUES (
    p_username,
    crypt(p_password, gen_salt('bf')),
    'viewer',          -- new users start as viewer role
    p_full_name,
    p_email,
    false,             -- can_view: yeni kayıt olanlarda hiçbir yetki yok
    false,             -- can_edit
    false,             -- can_create
    false,             -- can_delete
    false,             -- can_export
    false,             -- can_route
    false              -- can_team_view
  )
  RETURNING id INTO v_user_id;

  RETURN json_build_object(
    'success', true,
    'user_id', v_user_id,
    'message', 'Hesabınız başarıyla oluşturuldu'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Bu kullanıcı adı veya e-posta zaten kullanılıyor');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Kayıt sırasında bir hata oluştu');
END;
$$;

-- Grant execute permission to anon/authenticated roles (idempotent)
GRANT EXECUTE ON FUNCTION register_app_user(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION register_app_user(text, text, text, text) TO authenticated;
