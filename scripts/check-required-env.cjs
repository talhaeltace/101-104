// Fails the build early when required Vite env vars are missing.
// This prevents App Store/TestFlight uploads that boot to a blank screen.

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

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
  if (v.includes('your_supabase')) return true;
  if (v.includes('example')) return true;
  if (v.includes('changeme')) return true;
  return false;
}

function main() {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'production';
  const fromFiles = loadViteLikeEnvFiles(mode);

  const resolved = {};
  for (const k of REQUIRED) {
    resolved[k] = process.env[k] ?? fromFiles[k];
  }

  const missing = REQUIRED.filter((k) => !resolved[k]);
  const placeholders = REQUIRED.filter((k) => resolved[k] && looksLikePlaceholder(resolved[k]));

  if (missing.length || placeholders.length) {
    const lines = [];
    lines.push('❌ Missing/invalid required env vars for MapFlow build:');
    for (const k of REQUIRED) {
      const status = !resolved[k] ? 'MISSING' : placeholders.includes(k) ? 'PLACEHOLDER' : 'OK';
      lines.push(`- ${k}: ${status}`);
    }
    lines.push('');
    lines.push('Fix (recommended for iOS/Android release builds):');
    lines.push('- Create .env.production (or set CI env vars) with real values:');
    lines.push('  VITE_SUPABASE_URL=...');
    lines.push('  VITE_SUPABASE_ANON_KEY=...');
    lines.push('');
    lines.push('Then run:');
    lines.push('  npm run build');
    lines.push('  npx cap sync ios');
    lines.push('');
    lines.push('Why: VITE_* vars are baked into the JS bundle at build time.');

    // eslint-disable-next-line no-console
    console.error(lines.join('\n'));
    process.exit(1);
  }
}

main();
