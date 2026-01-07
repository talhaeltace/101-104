-- Recreate app_version table (use if table was deleted)
-- Supports platform-specific releases and store-based updates.

CREATE TABLE IF NOT EXISTS public.app_version (
  id BIGSERIAL PRIMARY KEY,
  version_code INTEGER NOT NULL,
  version_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  store_url TEXT,
  apk_url TEXT,
  release_notes TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

DO $$
BEGIN
  -- Ensure platform values are constrained.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_version_platform_check'
  ) THEN
    ALTER TABLE public.app_version
      ADD CONSTRAINT app_version_platform_check
      CHECK (platform IN ('android','ios','web'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_version_platform_version_code_idx
  ON public.app_version (platform, version_code DESC);

-- Enable RLS
ALTER TABLE public.app_version ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_version'
      AND policyname = 'Anyone can read app version'
  ) THEN
    CREATE POLICY "Anyone can read app version"
      ON public.app_version
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_version'
      AND policyname = 'Only admins can update version'
  ) THEN
    CREATE POLICY "Only admins can update version"
      ON public.app_version
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.app_users
          WHERE public.app_users.id = auth.uid()
            AND public.app_users.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.app_users
          WHERE public.app_users.id = auth.uid()
            AND public.app_users.role = 'admin'
        )
      );
  END IF;
END $$;

-- Optional seed rows (edit version_code/version_name per your release)
-- INSERT INTO public.app_version (version_code, version_name, platform, store_url, apk_url, release_notes, is_mandatory)
-- VALUES
--   (23, '2.1.8', 'android', 'https://play.google.com/store/apps/details?id=com.nelit.project101104&hl=tr', NULL, NULL, false),
--   (24, '2.1.8', 'ios',     'https://apps.apple.com/tr/app/mapflow/id6755817368?l=tr', NULL, NULL, false);
