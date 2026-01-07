-- Extend app_version table to support Play Store / App Store based updates.
-- Keeps backward compatibility with existing APK direct-download flow.

ALTER TABLE IF EXISTS public.app_version
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'android',
  ADD COLUMN IF NOT EXISTS store_url text,
  ADD COLUMN IF NOT EXISTS created_by text;

-- apk_url was historically required; for store-based updates we allow it to be NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_version'
      AND column_name = 'apk_url'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.app_version ALTER COLUMN apk_url DROP NOT NULL;
  END IF;
END $$;

-- Ensure platform values are constrained.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'app_version'
      AND c.relkind = 'r'
  ) THEN
    RETURN;
  END IF;

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

-- Optional: for convenience, keep the newest row per platform as the latest.
-- (No enforcement here; admins should insert a new row per release.)

-- If RLS is enabled, keep the existing "Anyone can read" behavior.
-- No policy changes here to avoid breaking existing setups.
