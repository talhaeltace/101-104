-- Add full_name and email columns to app_users
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS email text UNIQUE;

-- Update authenticate_app_user to return new fields
DROP FUNCTION IF EXISTS authenticate_app_user(text, text) CASCADE;

CREATE OR REPLACE FUNCTION authenticate_app_user(p_username text, p_password text)
RETURNS TABLE(id uuid, username text, role text, full_name text, email text) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.username, a.role, a.full_name, a.email
  FROM app_users a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION authenticate_app_user(text, text) TO anon;
GRANT EXECUTE ON FUNCTION authenticate_app_user(text, text) TO authenticated;

-- Create register_app_user function
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

  -- Insert new user with 'viewer' role (read-only access)
  INSERT INTO app_users (username, password_hash, role, full_name, email)
  VALUES (
    p_username,
    crypt(p_password, gen_salt('bf')),
    'viewer',  -- New users get viewer role (read-only)
    p_full_name,
    p_email
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

-- Grant execute permission to anon role
GRANT EXECUTE ON FUNCTION register_app_user(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION register_app_user(text, text, text, text) TO authenticated;
