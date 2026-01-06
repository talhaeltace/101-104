-- Admin user create/update helpers to ensure passwords are stored as bcrypt hashes (pgcrypto crypt)
-- and admin-driven password changes take effect for subsequent logins.
--
-- NOTE: This project uses a custom app_users table + authenticate_app_user RPC.
-- Passwords must be stored as crypt(...) hashes because login checks:
--   password_hash = crypt(p_password, password_hash)

BEGIN;

-- ensure pgcrypto is available for crypt() and gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure expected columns exist (idempotent)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Create user with hashed password and role-based default permissions
CREATE OR REPLACE FUNCTION admin_create_app_user(
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

  INSERT INTO app_users (
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
    can_team_view
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
    CASE WHEN v_role = 'admin' THEN true ELSE false END
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

-- Update user fields; if p_password is provided, re-hash it with crypt()
CREATE OR REPLACE FUNCTION admin_update_app_user(
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

GRANT EXECUTE ON FUNCTION admin_create_app_user(text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION admin_create_app_user(text, text, text, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION admin_update_app_user(uuid, text, text, text, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION admin_update_app_user(uuid, text, text, text, text, text, text, boolean) TO authenticated;

COMMIT;
