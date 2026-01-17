BEGIN;

-- In-app messaging between admin(s) and users.
-- Thread model: each message belongs to a single user via user_id.
-- Admin can broadcast by inserting one row per user.

CREATE TABLE IF NOT EXISTS public.app_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_messages_user_id_created_at_idx
  ON public.app_messages (user_id, created_at);

CREATE INDEX IF NOT EXISTS app_messages_sender_user_id_created_at_idx
  ON public.app_messages (sender_user_id, created_at);

COMMIT;
