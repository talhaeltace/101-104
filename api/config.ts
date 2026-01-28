export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || String(v).trim() === '') throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v || String(v).trim() === '') return undefined;
  return v;
}
