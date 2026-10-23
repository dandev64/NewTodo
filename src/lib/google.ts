// Google Calendar (read + write) using the browser-only OAuth token flow.
// We use a full-page redirect rather than a popup because popups are unreliable
// inside an iOS home-screen web app. Tokens last ~1 hour and there is no refresh
// token without a backend, so an expired session shows a one-tap "Reconnect".
import { useSyncExternalStore } from 'react';
import { addDays, toKey } from './date';

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
/** Read and write events. Older connections only granted `.readonly`; see `canWrite`. */
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** List the user's calendars, so events from all visible calendars (not just primary) are shown. */
const CALENDARLIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const AUTH_KEY = 'todomate.google';
const STATE_KEY = 'todomate.google.oauthState';
const API = 'https://www.googleapis.com/calendar/v3';
/** Private extended property that marks events created from a todo. */
export const TODO_ID_PROP = 'todomateId';

type GoogleAuth = {
  accessToken?: string;
  expiresAt?: number;
  calendarName?: string;
  /** Space-separated scopes Google granted with the current token. */
  scope?: string;
};

export type GEvent = {
  id: string;
  title: string;
  allDay: boolean;
  start: Date;
  end: Date;
  /** Every local date (YYYY-MM-DD) the event touches. */
  days: string[];
  /** Local start time HH:MM and length in minutes, for timed events. */
  time?: string;
  duration?: number;
  link?: string;
  /** Background color of the calendar the event is on. */
  color?: string;
};

/** An event the app created from a todo, as it currently looks in Google. */
export type AppEvent = {
  id: string;
  recurringEventId?: string;
  todoId: string;
  title: string;
  done: boolean;
  date: string;
  time?: string;
  duration?: number;
};

export type MonthEvents = {
  events: GEvent[];
  appEvents: AppEvent[];
  /** Date window covered by the fetch: [from, to). */
  from: string;
  to: string;
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

export const currentToken = () => auth?.accessToken ?? null;

const hasScope = (a: GoogleAuth | null, scope: string) => !!a?.scope?.split(' ').includes(scope);

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
    /** False for connections made before write access was added: they must reconnect once. */
    canWrite: hasScope(a, EVENTS_SCOPE),
    /** False when only the primary calendar can be read (connected before the calendar-list permission). */
    allCalendars: hasScope(a, CALENDARLIST_SCOPE),
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
    scope: `${EVENTS_SCOPE} ${CALENDARLIST_SCOPE}`,
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
    scope: params.get('scope') ?? undefined,
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
/** The event no longer exists (deleted in Google Calendar). */
export class GoogleEventGone extends Error {}

/** `null` explicitly clears a field: PATCH merges nested objects, so switching all-day ↔ timed must null the other form. */
type EventTime = { date?: string | null; dateTime?: string | null; timeZone?: string | null };

type ApiEvent = {
  id: string;
  recurringEventId?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start: EventTime;
  end: EventTime;
  extendedProperties?: { private?: Record<string, string> };
};

export type EventInput = {
  summary: string;
  description?: string;
  start: EventTime;
  end: EventTime;
  colorId?: string;
  extendedProperties?: { private?: Record<string, string> };
};

async function api(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    writeAuth({ ...auth, accessToken: undefined, expiresAt: undefined });
    throw new GoogleAuthExpired('Google session expired');
  }
  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('insufficient')) {
      // Token lacks a needed scope: show "Update permissions" instead of retrying forever.
      writeAuth({ ...auth, scope: undefined });
      throw new GoogleAuthExpired('Google Calendar permission is needed');
    }
    throw new Error(`Google Calendar error (403)`);
  }
  if (res.status === 404 || res.status === 410) throw new GoogleEventGone('Event not found');
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      // non-JSON error body
    }
    throw new Error(`Google Calendar error (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

const PRIMARY = '/calendars/primary/events';

/** Create (no id) or update an event on the primary calendar. Returns the event id. */
export async function saveEvent(token: string, eventId: string | undefined, event: EventInput): Promise<string> {
  // nulls only make sense for PATCH (clearing a merged field); leave them out of inserts.
  const res = eventId
    ? await api(token, `${PRIMARY}/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(event) })
    : await api(token, PRIMARY, { method: 'POST', body: JSON.stringify(event, (_k, v) => (v === null ? undefined : v)) });
  const saved = (await res.json()) as ApiEvent;
  // A PATCH on an event the user deleted in Google succeeds but stays cancelled.
  if (saved.status === 'cancelled') throw new GoogleEventGone('Event was deleted in Google Calendar');
  return saved.id;
}

export async function deleteEvent(token: string, eventId: string): Promise<void> {
  try {
    await api(token, `${PRIMARY}/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (!(e instanceof GoogleEventGone)) throw e;
  }
}

type CalendarInfo = { id: string; color?: string };
let calendarCache: { token: string; calendars: CalendarInfo[] } | null = null;

/** Calendars ticked in the user's Google Calendar sidebar; primary only without the calendar-list scope. */
async function visibleCalendars(token: string): Promise<CalendarInfo[]> {
  if (!hasScope(auth, CALENDARLIST_SCOPE)) return [{ id: 'primary' }];
  if (calendarCache?.token === token) return calendarCache.calendars;
  const res = await api(token, '/users/me/calendarList?minAccessRole=reader&maxResults=250');
  const body = (await res.json()) as {
    items?: { id: string; primary?: boolean; selected?: boolean; hidden?: boolean; backgroundColor?: string }[];
  };
  const calendars = (body.items ?? [])
    .filter((c) => c.primary || (c.selected && !c.hidden))
    .map((c) => ({ id: c.primary ? 'primary' : c.id, color: c.backgroundColor }));
  calendarCache = { token, calendars: calendars.length ? calendars : [{ id: 'primary' }] };
  return calendarCache.calendars;
}

async function listCalendarEvents(token: string, calendarId: string, params: URLSearchParams): Promise<ApiEvent[]> {
  const items: ApiEvent[] = [];
  const query = new URLSearchParams(params);
  for (let page = 0; page < 5; page++) {
    const res = await api(token, `/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
    const body = (await res.json()) as { items?: ApiEvent[]; nextPageToken?: string; summary?: string };
    items.push(...(body.items ?? []));
    if (calendarId === 'primary' && body.summary && body.summary !== auth?.calendarName) {
      writeAuth({ ...auth, calendarName: body.summary });
    }
    if (!body.nextPageToken) break;
    query.set('pageToken', body.nextPageToken);
  }
  return items.filter((e) => e.status !== 'cancelled');
}

/** Events for a month (plus a week either side) across the user's visible calendars. `month` is YYYY-MM. */
export async function listMonthEvents(token: string, month: string): Promise<MonthEvents> {
  const [y, m] = month.split('-').map(Number);
  const fromDate = new Date(y, m - 1, -6);
  const toDate = new Date(y, m, 8);
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
    timeMin: fromDate.toISOString(),
    timeMax: toDate.toISOString(),
  });

  const calendars = await visibleCalendars(token);
  const perCalendar = await Promise.all(
    calendars.map(async (c) => {
      try {
        return { c, items: await listCalendarEvents(token, c.id, params) };
      } catch (e) {
        // One unreadable secondary calendar shouldn't hide everything else.
        if (c.id === 'primary' || e instanceof GoogleAuthExpired) throw e;
        return { c, items: [] };
      }
    }),
  );

  const events: GEvent[] = [];
  const appEvents: AppEvent[] = [];
  for (const { c, items } of perCalendar) {
    for (const e of items) {
      const todoId = e.extendedProperties?.private?.[TODO_ID_PROP];
      const g = toGEvent(e, c.color);
      if (todoId) {
        // Already shown as a todo; kept separately so edits made in Google can flow back.
        const summary = e.summary ?? '';
        const done = summary.startsWith(DONE_PREFIX);
        appEvents.push({
          id: e.id,
          recurringEventId: e.recurringEventId,
          todoId,
          title: done ? summary.slice(DONE_PREFIX.length) : summary,
          done,
          date: g.days[0],
          time: g.time,
          duration: g.duration,
        });
      } else {
        events.push(g);
      }
    }
  }
  events.sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.start.getTime() - b.start.getTime());
  return { events, appEvents, from: toKey(fromDate), to: toKey(toDate) };
}

/** Prefix added to the title of events whose todo is done. */
export const DONE_PREFIX = '✓ ';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function toGEvent(e: ApiEvent, color?: string): GEvent {
  const allDay = !!e.start.date;
  const start = allDay ? localDate(e.start.date!) : new Date(e.start.dateTime!);
  const end = allDay ? localDate(e.end.date!) : new Date(e.end.dateTime!);

  // All-day end dates are exclusive; timed events end at an instant, so back off 1 ms.
  const first = toKey(start);
  const last = allDay ? addDays(toKey(end), -1) : toKey(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  if (days.length === 0) days.push(first);

  return {
    id: e.id,
    title: e.summary || '(No title)',
    allDay,
    start,
    end,
    days,
    time: allDay ? undefined : hhmm(start),
    duration: allDay ? undefined : Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)),
    link: e.htmlLink,
    color,
  };
}

function localDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
