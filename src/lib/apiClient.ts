type ApiErrorPayload = { error?: string; message?: string };

// Use native HTTP on Android/iOS to avoid WebView CORS/network quirks.
// (CapacitorHttp works in native shells and returns consistent results.)
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const API_BASE_URL_OVERRIDE_KEY = 'api_base_url_override_v1';

function normalizeBaseUrl(raw: unknown): string {
  const value = String(raw ?? '').trim();
  return value ? value.replace(/\/+$/, '') : '';
}

function isNativeShell(): boolean {
  // Capacitor.isNativePlatform() can be unreliable if Capacitor isn't initialized
  // the way we expect (e.g. some WebView/bridge edge cases). Use platform string.
  try {
    const p = Capacitor.getPlatform();
    return p === 'android' || p === 'ios';
  } catch {
    return false;
  }
}

export function setApiBaseUrlOverride(url: string | null): void {
  try {
    if (!url) localStorage.removeItem(API_BASE_URL_OVERRIDE_KEY);
    else localStorage.setItem(API_BASE_URL_OVERRIDE_KEY, normalizeBaseUrl(url));
  } catch {
    // ignore
  }
}

function getApiBaseUrlOverride(): string {
  try {
    const v = localStorage.getItem(API_BASE_URL_OVERRIDE_KEY);
    return normalizeBaseUrl(v);
  } catch {
    return '';
  }
}

const getBaseUrl = () => {
  // 1) Build-time env (preferred)
  // IMPORTANT: keep this as a direct `import.meta.env.VITE_*` access so Vite can bake
  // the value into the production bundle.
  const buildTime = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (buildTime) return buildTime;

  // 2) Runtime override (useful for Capacitor builds / environments where Vite env isn't injected)
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const qp = params.get('api') || params.get('apiBaseUrl') || params.get('baseUrl');
      const qpValue = normalizeBaseUrl(qp);
      if (qpValue) {
        setApiBaseUrlOverride(qpValue);
        return qpValue;
      }
    } catch {
      // ignore
    }

    const override = getApiBaseUrlOverride();
    if (override) return override;
  }

  // 3) Last-resort fallback (DEV only): same host, default API port.
  // In native shells, localhost will be blocked by Android cleartext policy;
  // require explicit configuration instead.
  try {
    if (typeof window !== 'undefined' && !isNativeShell()) {
      const host = window.location?.hostname || '127.0.0.1';
      return `http://${host}:8787`;
    }
  } catch {
    // ignore
  }

  return '';
};

export const AUTH_TOKEN_KEY = 'auth_token_v1';

function getSessionStorageSafe(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getLocalStorageSafe(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  try {
    const ss = getSessionStorageSafe();
    const t1 = ss?.getItem(AUTH_TOKEN_KEY);
    if (t1) return String(t1);

    // Backward compatibility: older builds stored the token in localStorage.
    const ls = getLocalStorageSafe();
    const t2 = ls?.getItem(AUTH_TOKEN_KEY);
    return t2 ? String(t2) : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    const ss = getSessionStorageSafe();
    const ls = getLocalStorageSafe();

    if (!token) {
      try { ss?.removeItem(AUTH_TOKEN_KEY); } catch { /* ignore */ }
      try { ls?.removeItem(AUTH_TOKEN_KEY); } catch { /* ignore */ }
      return;
    }

    // Use sessionStorage so closing the tab/app forces re-login.
    try { ss?.setItem(AUTH_TOKEN_KEY, token); } catch { /* ignore */ }
    // Remove localStorage token to avoid long-lived sessions.
    try { ls?.removeItem(AUTH_TOKEN_KEY); } catch { /* ignore */ }
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(path: string, opts?: {
  method?: string;
  body?: any;
  auth?: boolean;
  headers?: Record<string, string>;
}): Promise<T> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('Missing VITE_API_BASE_URL');
  }

  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = opts?.method ?? (opts?.body != null ? 'POST' : 'GET');

  const rawBody = opts?.body;
  const bodyToSend = rawBody != null
    ? (typeof rawBody === 'string' ? (rawBody.length > 0 ? rawBody : undefined) : JSON.stringify(rawBody))
    : undefined;

  const headers: Record<string, string> = {
    ...(opts?.headers ?? {}),
  };

  // Only set JSON content-type when we actually have a body.
  // (Fastify will throw if content-type=application/json but body is empty.)
  const hasContentTypeHeader = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (bodyToSend !== undefined && !hasContentTypeHeader) {
    headers['content-type'] = 'application/json';
  }

  if (opts?.auth !== false) {
    const token = getAuthToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  // Native (Android/iOS): bypass CORS by using CapacitorHttp.
  if (Capacitor.isNativePlatform()) {
    // CapacitorHttp expects an object for JSON; it will serialize.
    let data: any = undefined;
    if (rawBody != null) {
      if (typeof rawBody === 'string') {
        // If a caller passed a JSON string, try to parse into an object.
        // Otherwise pass as-is.
        try {
          data = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
        } catch {
          data = rawBody;
        }
      } else {
        data = rawBody;
      }
    }

    const r = await CapacitorHttp.request({
      url,
      method,
      headers,
      data,
    });

    if (r.status < 200 || r.status >= 300) {
      const payload = (r.data ?? {}) as ApiErrorPayload;
      const msg = payload?.error ?? payload?.message ?? `HTTP ${r.status}`;
      throw new Error(msg);
    }

    return (r.data ?? {}) as T;
  }

  // Web: normal fetch
  const res = await fetch(url, {
    method,
    headers,
    body: bodyToSend,
  });

  const text = await res.text().catch(() => '');
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;

  if (!res.ok) {
    const payload = (json ?? {}) as ApiErrorPayload;
    const msg = payload.error ?? payload.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (json ?? {}) as T;
}
