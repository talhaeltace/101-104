-- PostgREST cannot choose between overloaded functions when named parameters match.
-- Remove the wrapper overload so only the canonical admin_update_app_user remains.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_update_app_user(text, text, boolean, text, text, uuid, text);

-- Ask PostgREST (Supabase API) to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
