import * as SecureStore from 'expo-secure-store';

/** Where Orbit runs. Set EXPO_PUBLIC_API_URL in mobile-app/.env (an https address for an installed app). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000').replace(/\/$/, '');
export const API_ORIGIN = (() => {
  try { return new URL(API_URL).origin; } catch { return API_URL; }
})();

const TOKEN_KEY = 'access_token';
export const readToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const saveToken = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const forgetToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly needsCode = false) {
    super(message);
  }
}

/** Calls an Orbit route with the saved session. A 401 means the session has ended: sign in again. */
export async function api<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
    });
  } catch {
    throw new ApiError("Can't reach Orbit. Check your internet connection and try again.", 0);
  }
  const text = await response.text();
  let data: { error?: string; needsCode?: boolean } & Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Orbit sent an answer the app could not read.' }; }
  if (!response.ok) throw new ApiError(data.error || `Something went wrong (${response.status}). Try again.`, response.status, data.needsCode === true);
  return data as T;
}

export type AttendanceSession = { id: string; checkIn: string; checkOut: string | null; workDate: string };
export type Dashboard = {
  user: { id: string; name: string; email: string; role: string; employee: { id: string; code: string; designation: string; department: string | null } };
  date: string;
  attendance: { sessions: AttendanceSession[]; openSession: AttendanceSession | null; checkedIn: boolean; pendingLeave: number };
};
export type MenuItem = { href: string; label: string; badge?: number; section?: string };
export type MenuGroup = { title: string; icon: string; items: MenuItem[] };
export type Menu = { company: string; counts: { approvals: number; messages: number; inbox: number }; groups: MenuGroup[] };

/**
 * The address that opens an Orbit page inside the app already signed in. The session token never goes in an
 * address: Orbit swaps it for a code that works once, for one minute (src/lib/mobile-open.ts on the server).
 */
export async function signedInAddress(token: string, path: string) {
  const { code } = await api<{ code: string }>('/api/mobile/open-code', token, { method: 'POST', body: '{}' });
  return `${API_URL}/api/mobile/open?code=${encodeURIComponent(code)}&to=${encodeURIComponent(path)}`;
}
