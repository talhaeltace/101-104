// Fails the build early when required Vite env vars are missing.
// This prevents App Store/TestFlight uploads that boot to a blank screen.

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// MapFlow now runs exclusively in API (MySQL) mode.
// VITE_* vars are baked into the JS bundle at build time.
const REQUIRED_API = ['VITE_API_BASE_URL'];

/**
 * Very small .env parser (key=value, optional quotes).
 * Enough for our Vite env files.
 */
function parseEnvFile(filePath) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return out;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) out[key] = value;
  }

  return out;
}

function loadViteLikeEnvFiles(mode) {
  // Vite load order (later overrides earlier):
  // .env
  // .env.local
  // .env.[mode]
  // .env.[mode].local
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
  const merged = {};

  for (const f of files) {
    const fp = path.join(projectRoot, f);
    if (!fs.existsSync(fp)) continue;
    Object.assign(merged, parseEnvFile(fp));
  }

  return merged;
}

function looksLikePlaceholder(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  // Legacy placeholder patterns we want to reject.
  if (v.includes('your_supabase')) return true;
  if (v.includes('your_api')) return true;
  if (v.includes('api.your')) return true;
  if (v.includes('yourdomain')) return true;
  if (v.includes('example')) return true;
  if (v.includes('changeme')) return true;
  return false;
}

function isUnsafeForReleaseApiBaseUrl(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  // Disallow localhost/127 in release builds.
  if (v.includes('localhost') || v.includes('127.0.0.1')) return true;
  // Prefer HTTPS for store builds; allow HTTP only when explicitly overridden.
  if (v.startsWith('http://')) return true;
  return false;
}

function main() {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'production';
  const fromFiles = loadViteLikeEnvFiles(mode);

  const resolved = {};
  for (const k of [...REQUIRED_API]) {
    resolved[k] = process.env[k] ?? fromFiles[k];
  }

  const hasApiMode = !!resolved.VITE_API_BASE_URL && !looksLikePlaceholder(resolved.VITE_API_BASE_URL);
  const allowUnsafe = String(process.env.ALLOW_LOCAL_API_BASE_URL || '').trim() === '1';
  const isUnsafe = !allowUnsafe && isUnsafeForReleaseApiBaseUrl(resolved.VITE_API_BASE_URL);

  if (!hasApiMode || isUnsafe) {
    const lines = [];
    lines.push('❌ Missing/invalid required env vars for MapFlow release build:');
    lines.push('');
    lines.push('Required:');
    for (const k of REQUIRED_API) {
      const status = !resolved[k] ? 'MISSING' : looksLikePlaceholder(resolved[k]) ? 'PLACEHOLDER' : 'OK';
      lines.push(`  - ${k}: ${status}`);
    }
    if (resolved.VITE_API_BASE_URL) {
      lines.push('');
      lines.push(`Resolved VITE_API_BASE_URL: ${resolved.VITE_API_BASE_URL}`);
      if (isUnsafe) {
        lines.push('');
        lines.push('This looks unsafe for App Store / Google Play (localhost or http://).');
      }
    }
    lines.push('');
    lines.push('Fix (recommended for iOS/Android release builds):');
    lines.push('- Create .env.production (or set CI env vars) with real values.');
    lines.push('  Example:');
    lines.push('    VITE_API_BASE_URL=https://api.yourdomain.com');
    lines.push('');
    lines.push('For local testing only, you may override this safety check:');
    lines.push('  - Windows PowerShell: $env:ALLOW_LOCAL_API_BASE_URL=1; npm run build');
    lines.push('');
    lines.push('Then run:');
    lines.push('  npm run build');
    lines.push('  npx cap sync ios');
    lines.push('');
    lines.push('Why: VITE_* vars are baked into the JS bundle at build time.');

    console.error(lines.join('\n'));
    process.exit(1);
  }
}

main();
