// Utility functions for robust, Turkish-friendly, accent-insensitive searching
// - Normalizes case with tr locale
// - Strips diacritics
// - Maps Turkish-specific letters to ASCII equivalents
// - Removes punctuation and collapses whitespace

export function normalizeSearch(input: string | null | undefined): string {
  if (!input) return '';
  // Locale-aware lowercase then NFD to split diacritics
  let s = String(input).trim().toLocaleLowerCase('tr');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Map Turkish characters and unify dotless i
  s = s
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');
  // Remove punctuation/symbols, keep letters and digits, collapse spaces
  s = s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

export function includesNormalized(haystack: string, needle: string): boolean {
  const h = normalizeSearch(haystack);
  const n = normalizeSearch(needle);
  if (!n) return true;
  return h.includes(n);
}

export function fieldsMatchQuery(query: string, ...fields: Array<string | null | undefined>): boolean {
  if (!query) return true;
  const q = normalizeSearch(query);
  if (!q) return true;
  for (const f of fields) {
    if (!f) continue;
    if (normalizeSearch(f).includes(q)) return true;
  }
  // Also try combined fields to allow cross-word matches across boundaries
  const combined = normalizeSearch(fields.filter(Boolean).join(' '));
  return combined.includes(q);
}
