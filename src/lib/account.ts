// The app account (Sign in with Google → our own long-lived session from /api/auth/google).
// Shared across components with useSyncExternalStore; the sync engine lives in cloudSync.ts.
import { useSyncExternalStore } from 'react';

export type AccountUser = { id: string; email: string; name?: string; picture?: string };

type Session = {
  token: string;
  user: AccountUser;
  /** The server rejected the session (expired/revoked): local data is kept, user must sign in again. */
  expired?: boolean;
};

export type SyncStatus =
  | { state: 'idle'; lastSyncAt?: number }
  | { state: 'syncing'; lastSyncAt?: number }
  | { state: 'offline'; lastSyncAt?: number }
  | { state: 'error'; lastSyncAt?: number; error: string };

type Snapshot = {
  session: Session | null;
  status: SyncStatus;
  signingIn: boolean;
  error: string | null;
};

const KEY = 'todomate.account';

function read(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
    return s?.token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

let snap: Snapshot = { session: read(), status: { state: 'idle' }, signingIn: false, error: null };
const listeners = new Set<() => void>();

function update(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  if ('session' in patch) {
    if (snap.session) localStorage.setItem(KEY, JSON.stringify(snap.session));
    else localStorage.removeItem(KEY);
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useAccount = () => useSyncExternalStore(subscribe, () => snap);

/** Session token for API calls, or null when signed out / expired. */
export const sessionToken = () => (snap.session && !snap.session.expired ? snap.session.token : null);
export const currentUserId = () => snap.session?.user.id ?? null;

/** Exchange the Google ID token from the sign-in redirect for an app session. */
export async function completeSignIn(idToken: string, nonce: string) {
  update({ signingIn: true, error: null });
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken, nonce }),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string; user?: AccountUser; error?: string };
    if (!res.ok || !body.token || !body.user) throw new Error(body.error ?? `Sign-in failed (${res.status})`);
    update({ session: { token: body.token, user: body.user }, signingIn: false });
  } catch (e) {
    update({ signingIn: false, error: e instanceof Error ? e.message : String(e) });
  }
}

export function markSessionExpired() {
  if (snap.session) update({ session: { ...snap.session, expired: true } });
}

export function clearSession() {
  update({ session: null, status: { state: 'idle' }, error: null });
}

export function setSyncStatus(status: SyncStatus) {
  // Keep showing when we last synced successfully while a new round runs or fails.
  update({ status: { ...status, lastSyncAt: status.lastSyncAt ?? snap.status.lastSyncAt } as SyncStatus });
}

export function dismissAccountError() {
  update({ error: null });
}
