// Shared cache of Google events per month, kept fresh while the app is open:
// refetched when the app regains focus / becomes visible, and every minute while visible.
// Both the Home screen (display) and the sync engine (Google → todo changes) read from it.
import { useEffect, useSyncExternalStore } from 'react';
import { GoogleAuthExpired, currentToken, listMonthEvents, useGoogleAuth, type MonthEvents } from './google';

export type MonthEntry = {
  month: string;
  /** Token the data was fetched with; data from an older token is treated as stale. */
  token: string;
  data?: MonthEvents;
  /** When the fetch that produced `data` started. Todos synced after this are newer than the data. */
  fetchStartedAt: number;
  fetchedAt: number;
  loading: boolean;
  error?: string;
};

/** Refetch on-screen months once their data is this old… */
const MAX_AGE_MS = 60_000;
/** …checked this often (a single long interval could skip a tick and wait ~2× MAX_AGE). */
const TICK_MS = 15_000;
/** Returning to the app refetches unless the data is fresher than this. */
const FOCUS_STALE_MS = 3_000;

const entries = new Map<string, MonthEntry>();
/** Months currently on screen (ref-counted by useMonthEvents). */
const active = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: MonthEntry[] = [];

function set(month: string, entry: MonthEntry) {
  entries.set(month, entry);
  snapshot = [...entries.values()];
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Fetch a month now unless a fetch is already running (or the data is younger than `maxAge`). */
export async function refreshMonth(month: string, maxAge = 0) {
  const token = currentToken();
  if (!token) return;
  const prev = entries.get(month);
  if (prev?.token === token && (prev.loading || Date.now() - prev.fetchedAt < maxAge)) return;

  const fetchStartedAt = Date.now();
  const base = prev?.token === token ? prev : undefined;
  set(month, { month, token, data: base?.data, fetchStartedAt: base?.fetchStartedAt ?? 0, fetchedAt: base?.fetchedAt ?? 0, loading: true });
  try {
    const data = await listMonthEvents(token, month);
    set(month, { month, token, data, fetchStartedAt, fetchedAt: Date.now(), loading: false });
  } catch (e) {
    const error = e instanceof GoogleAuthExpired ? undefined : e instanceof Error ? e.message : String(e);
    set(month, { ...entries.get(month)!, loading: false, fetchedAt: Date.now(), error });
  }
}

function refreshActive(maxAge: number) {
  if (document.visibilityState !== 'visible') return;
  for (const [month, n] of active) if (n > 0) refreshMonth(month, maxAge);
}

/** Events for a YYYY-MM month, fetched on demand and kept fresh while the month is on screen. */
export function useMonthEvents(month: string) {
  const { token } = useGoogleAuth();
  const entry = useSyncExternalStore(subscribe, () => entries.get(month));

  useEffect(() => {
    active.set(month, (active.get(month) ?? 0) + 1);
    if (token) refreshMonth(month, FOCUS_STALE_MS);
    return () => {
      active.set(month, (active.get(month) ?? 1) - 1);
    };
  }, [month, token]);

  const current = entry?.token === token ? entry : undefined;
  return {
    events: current?.data?.events ?? [],
    loading: !!token && !current?.data && !current?.error,
    error: current?.error ?? null,
    refresh: () => refreshMonth(month),
  };
}

/** All fetched months (used by the sync engine to pull Google-side changes into todos). */
export const useAllMonthEntries = () => useSyncExternalStore(subscribe, () => snapshot);

/** Mount once (in App): refetch on focus / visibility, and poll while visible. */
export function useGoogleAutoRefresh() {
  useEffect(() => {
    const onFocus = () => refreshActive(FOCUS_STALE_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(() => refreshActive(MAX_AGE_MS), TICK_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(timer);
    };
  }, []);
}
