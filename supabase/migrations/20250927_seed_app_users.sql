-- Migration: create app_users and authenticate_app_user RPC
-- Run this in your Supabase database (psql or Supabase SQL editor)
-- Migration: create or recreate app_users and authenticate_app_user RPC
-- Use this when you want a fresh setup; it drops existing objects and recreates them.
-- Run this in Supabase SQL editor (or psql). It will set both users' passwords to
-- '20Passw0rd25.!' (Postgres will hash them using pgcrypto).

BEGIN;

-- ensure pgcrypto is available for crypt() and gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- remove function/table if they exist (start fresh)
DROP FUNCTION IF EXISTS authenticate_app_user(text, text) CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;

-- recreate table
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

-- seed two users: admin and user with the requested password (hashed server-side)
INSERT INTO app_users (username, password_hash, role)
VALUES
  ('admin', crypt('Nelit1071', gen_salt('bf')), 'admin'),
  ('hasan.huseyin',  crypt('42726', gen_salt('bf')), 'editor'),
  ('soner.delibas',  crypt('20Passw0rd25.!', gen_salt('bf')), 'editor'),
  ('oguzhan.ozmen',  crypt('20Passw0rd25.!', gen_salt('bf')), 'editor'),
  ('muhammet.can',  crypt('20Passw0rd25.!', gen_salt('bf')), 'editor'),
  ('mehmet.varol',  crypt('20Passw0rd25.!', gen_salt('bf')), 'editor'),
  ('user',  crypt('20Passw0rd25.!', gen_salt('bf')), 'user');

-- recreate the authenticate RPC (clear aliasing to avoid ambiguity)
CREATE OR REPLACE FUNCTION authenticate_app_user(p_username text, p_password text)
RETURNS TABLE(id uuid, username text, role text) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.username, a.role
  FROM app_users a
  WHERE a.username = p_username
    AND a.password_hash = crypt(p_password, a.password_hash)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- allow anonymous clients to call the RPC (if you want public access from the web client)
GRANT EXECUTE ON FUNCTION authenticate_app_user(text, text) TO anon;

COMMIT;

-- Quick manual test (run after applying the migration):
-- SELECT * FROM authenticate_app_user('admin', '20Passw0rd25.!');
