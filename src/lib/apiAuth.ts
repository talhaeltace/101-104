import type { AuthUser } from './authUser';
import { apiFetch, setAuthToken } from './apiClient';

export async function requestOtp(params: { username: string; password: string }): Promise<{
  bypassOtp?: boolean;
  token?: string;
  user?: AuthUser;
  challengeId?: string;
  emailMasked?: string | null;
}> {
  return apiFetch('/auth/request-otp', { method: 'POST', body: params, auth: false });
}

export async function verifyOtp(params: { challengeId: string; code: string }): Promise<{ token: string; user: AuthUser }> {
  const res = await apiFetch<{ token: string; user: AuthUser }>('/auth/verify-otp', { method: 'POST', body: params, auth: false });
  if (res?.token) setAuthToken(res.token);
  return res;
}

export async function registerUser(params: { username: string; password: string; fullName?: string; email?: string }): Promise<{ success: boolean }> {
  return apiFetch('/auth/register', { method: 'POST', body: params, auth: false });
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  return apiFetch('/me', { method: 'GET' });
}
