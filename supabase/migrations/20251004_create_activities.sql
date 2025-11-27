-- Create activities table to store app activity logs
BEGIN;

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Allow the anon role to insert/select so the client can log activities from the browser.
-- In production you should replace this with RLS policies that validate auth and claims.
GRANT SELECT, INSERT ON activities TO anon;

COMMIT;
