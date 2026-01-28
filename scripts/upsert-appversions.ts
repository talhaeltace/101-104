import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

type Platform = 'android' | 'ios' | 'web';

function parseBoolEnv(name: string, fallback = false): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'n') return false;
  return fallback;
}

function requireEnv(name: string): string {
  const v = String(process.env[name] ?? '').trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function upsertAppVersion(
  prisma: PrismaClient,
  row: {
    platform: Platform;
    version_code: number;
    version_name: string;
    store_url?: string | null;
    apk_url?: string | null;
    release_notes?: string | null;
    is_mandatory?: boolean;
  },
) {
  const existing = await prisma.appVersion.findFirst({
    where: {
      platform: row.platform,
      version_code: row.version_code,
    },
    orderBy: { id: 'desc' },
  });

  if (existing) {
    await prisma.appVersion.update({
      where: { id: existing.id },
      data: {
        version_name: row.version_name,
        store_url: row.store_url ?? null,
        apk_url: row.apk_url ?? null,
        release_notes: row.release_notes ?? null,
        is_mandatory: row.is_mandatory ?? false,
      },
    });
    console.log(`Updated appversion id=${existing.id} (${row.platform} vc=${row.version_code})`);
    return;
  }

  const created = await prisma.appVersion.create({
    data: {
      platform: row.platform,
      version_code: row.version_code,
      version_name: row.version_name,
      store_url: row.store_url ?? null,
      apk_url: row.apk_url ?? null,
      release_notes: row.release_notes ?? null,
      is_mandatory: row.is_mandatory ?? false,
    },
  });

  console.log(`Inserted appversion id=${created.id} (${row.platform} vc=${row.version_code})`);
}

async function main() {
  // Ensure Prisma has a DB target.
  requireEnv('DATABASE_URL');

  const prisma = new PrismaClient();

  const releaseNotes = String(process.env.RELEASE_NOTES ?? '').trim() || null;
  const isMandatory = parseBoolEnv('IS_MANDATORY', false);

  const androidApkUrl = String(process.env.ANDROID_APK_URL ?? '').trim() || null;
  const androidStoreUrl = String(process.env.ANDROID_STORE_URL ?? '').trim() || null;
  const iosStoreUrl = String(process.env.IOS_STORE_URL ?? '').trim() || null;

  // Keep these in sync with src/components/VersionChecker.tsx and native build settings.
  const rows = [
    {
      platform: 'android' as const,
      version_code: 33,
      version_name: '2.1.15',
      store_url: androidStoreUrl,
      apk_url: androidApkUrl,
      release_notes: releaseNotes,
      is_mandatory: isMandatory,
    },
    {
      platform: 'ios' as const,
      version_code: 44,
      version_name: '2.1.15',
      store_url: iosStoreUrl,
      apk_url: null,
      release_notes: releaseNotes,
      is_mandatory: isMandatory,
    },
  ];

  try {
    for (const row of rows) {
      await upsertAppVersion(prisma, row);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
