// Google Calendar (read-only) using the browser-only OAuth token flow.
// We use a full-page redirect rather than a popup because popups are unreliable
// inside an iOS home-screen web app. Tokens last ~1 hour and there is no refresh
// token without a backend, so an expired session shows a one-tap "Reconnect".
import { useSyncExternalStore } from 'react';
import { addDays, toKey } from './date';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const AUTH_KEY = 'todomate.google';
const STATE_KEY = 'todomate.google.oauthState';
const API = 'https://www.googleapis.com/calendar/v3';

type GoogleAuth = {
  accessToken?: string;
  expiresAt?: number;
  calendarName?: string;
};

export type GEvent = {
  id: string;
  title: string;
  allDay: boolean;
  start: Date;
  end: Date;
  /** Every local date (YYYY-MM-DD) the event touches. */
  days: string[];
  link?: string;
};

// ---------- connection state (shared across components) ----------

function readAuth(): GoogleAuth | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null');
  } catch {
    return null;
  }
}

let auth = readAuth();
const listeners = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function writeAuth(next: GoogleAuth | null) {
  auth = next;
  if (next) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
  else localStorage.removeItem(AUTH_KEY);
  scheduleExpiry();
  listeners.forEach((l) => l());
}

/** Drop the access token a minute before Google expires it, so the UI flips to "Reconnect". */
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  if (!auth?.accessToken) return;
  const ms = (auth.expiresAt ?? 0) - Date.now() - 60_000;
  if (ms <= 0) {
    auth = { ...auth, accessToken: undefined, expiresAt: undefined };
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  } else {
    expiryTimer = setTimeout(() => writeAuth({ ...auth, accessToken: undefined, expiresAt: undefined }), ms);
  }
}
scheduleExpiry();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useGoogleAuth() {
  const a = useSyncExternalStore(subscribe, () => auth);
  const valid = !!a?.accessToken;
  return {
    configured: !!GOOGLE_CLIENT_ID,
    connected: !!a,
    valid,
    token: valid ? a!.accessToken! : null,
    calendarName: a?.calendarName,
  };
}

// ---------- sign in / out ----------

export function connectGoogle() {
  if (!GOOGLE_CLIENT_ID) return;
  const state = crypto.randomUUID();
  localStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${location.origin}/`,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** Call once at startup. Consumes `#access_token=…` from the redirect. Returns an error message, if any. */
export function handleGoogleRedirect(): string | null {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const expected = localStorage.getItem(STATE_KEY);
  localStorage.removeItem(STATE_KEY);
  history.replaceState(null, '', location.pathname + location.search);

  if (!expected || params.get('state') !== expected) return 'Google sign-in failed (state mismatch). Please try again.';
  const error = params.get('error');
  if (error) return error === 'access_denied' ? 'Google Calendar access was not granted.' : `Google sign-in failed: ${error}`;

  writeAuth({
    ...auth,
    accessToken: params.get('access_token')!,
    expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000,
  });
  return null;
}

export function disconnectGoogle() {
  const token = auth?.accessToken;
  writeAuth(null);
  if (token) {
    // Fire-and-forget revoke; the response is opaque under no-cors, which is fine.
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      mode: 'no-cors',
    }).catch(() => {});
  }
}

// ---------- API ----------

export class GoogleAuthExpired extends Error {}

type ApiEvent = {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
};

/** Events on the primary calendar for a month (plus a week either side). `month` is YYYY-MM. */
export async function listMonthEvents(token: string, month: string): Promise<GEvent[]> {
  const [y, m] = month.split('-').map(Number);
  const base = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
    timeMin: new Date(y, m - 1, -6).toISOString(),
    timeMax: new Date(y, m, 8).toISOString(),
  });

  const items: ApiEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    if (pageToken) base.set('pageToken', pageToken);
    const res = await fetch(`${API}/calendars/primary/events?${base}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      writeAuth({ ...auth, accessToken: undefined, expiresAt: undefined });
      throw new GoogleAuthExpired('Google session expired');
    }
    if (!res.ok) throw new Error(`Google Calendar error (${res.status})`);
    const body = (await res.json()) as { items?: ApiEvent[]; nextPageToken?: string; summary?: string };
    items.push(...(body.items ?? []));
    if (body.summary && body.summary !== auth?.calendarName) writeAuth({ ...auth, calendarName: body.summary });
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  return items.filter((e) => e.status !== 'cancelled').map(toGEvent);
}

function toGEvent(e: ApiEvent): GEvent {
  const allDay = !!e.start.date;
  const start = allDay ? localDate(e.start.date!) : new Date(e.start.dateTime!);
  const end = allDay ? localDate(e.end.date!) : new Date(e.end.dateTime!);

  // All-day end dates are exclusive; timed events end at an instant, so back off 1 ms.
  const first = toKey(start);
  const last = allDay ? addDays(toKey(end), -1) : toKey(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  if (days.length === 0) days.push(first);

  return { id: e.id, title: e.summary || '(No title)', allDay, start, end, days, link: e.htmlLink };
}

function localDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
