-- Harden work_entries access using RLS policies (company-internal usage)

-- Ensure schema usage (safe/idempotent)
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Enable RLS (idempotent)
ALTER TABLE public.work_entries ENABLE ROW LEVEL SECURITY;

-- Allow everyone (anon/authenticated) to read/write (matches existing app pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'work_entries'
      AND policyname = 'Herkes okuyabilir'
  ) THEN
    CREATE POLICY "Herkes okuyabilir"
      ON public.work_entries
      FOR SELECT
      TO public
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'work_entries'
      AND policyname = 'Herkes yazabilir'
  ) THEN
    CREATE POLICY "Herkes yazabilir"
      ON public.work_entries
      FOR INSERT
      TO public
      WITH CHECK (true);
  END IF;
END $$;

-- Ensure both anon and authenticated roles can access the table/sequence
GRANT SELECT, INSERT ON public.work_entries TO anon;
GRANT SELECT, INSERT ON public.work_entries TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.work_entries_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.work_entries_id_seq TO authenticated;
