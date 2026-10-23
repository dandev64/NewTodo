// Cloud sync for the signed-in account (backend: api/sync.ts, Neon Postgres).
//
// Every category, todo and the settings object is a "record". For each record we keep a
// small meta entry: a hash of its content, the time it was last changed (`u`) and whether
// that change still has to be uploaded (`p`). After any state change we diff the store
// against the hashes; changed records get a new `u` and are queued. A sync round sends the
// queued records and receives everything other devices wrote since our cursor. Conflicts
// are resolved per record: the newest `u` wins (on the server and here).
import { useEffect, useRef } from 'react';
import type { State, Todo } from '../types';
import { useStore, type GoalRecord } from '../store';
import { clearSession, currentUserId, markSessionExpired, sessionToken, setSyncStatus, useAccount } from './account';
import { forgetGoogle } from './google';

const META_KEY = 'todomate.sync';
const BATCH = 400;
const POLL_MS = 5_000;
const PUSH_DEBOUNCE_MS = 400;

type Kind = 'goal' | 'todo' | 'settings';
type RecMeta = { h: string; u: number; p?: 1; d?: 1 };
type Meta = { userId: string; cursor: number; initialized: boolean; records: Record<string, RecMeta> };
type RemoteChange = { kind: Kind; id: string; data: unknown; updated_at: number; deleted: boolean };

// ---------- hashing ----------

/** JSON with sorted keys and no undefined values, so equal content always hashes equally. */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`;
}

function hash(v: unknown): string {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${s.length}`;
}

// ---------- records ----------

const key = (kind: Kind, id: string) => `${kind}:${id}`;

function recordsOf(state: State): Map<string, { kind: Kind; id: string; data: object }> {
  const out = new Map<string, { kind: Kind; id: string; data: object }>();
  state.goals.forEach((g, pos) => out.set(key('goal', g.id), { kind: 'goal', id: g.id, data: { ...g, pos } }));
  for (const t of state.todos) out.set(key('todo', t.id), { kind: 'todo', id: t.id, data: t });
  out.set(key('settings', 'settings'), { kind: 'settings', id: 'settings', data: state.settings ?? {} });
  return out;
}

function loadMeta(userId: string): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Meta | null;
    if (m && m.userId === userId && m.records) return m;
  } catch {
    // start fresh
  }
  return { userId, cursor: 0, initialized: false, records: {} };
}

const saveMeta = (m: Meta) => localStorage.setItem(META_KEY, JSON.stringify(m));

/** Queue every record that differs from what was last synced. Returns true if anything was queued. */
function markDirty(meta: Meta, state: State): boolean {
  const now = Date.now();
  const current = recordsOf(state);
  let dirty = false;
  for (const [k, r] of current) {
    const h = hash(r.data);
    const m = meta.records[k];
    if (!m || m.d || m.h !== h) {
      meta.records[k] = { h, u: Math.max(now, (m?.u ?? 0) + 1), p: 1 };
      dirty = true;
    }
  }
  for (const [k, m] of Object.entries(meta.records)) {
    if (!current.has(k) && !m.d) {
      meta.records[k] = { h: '', u: Math.max(now, m.u + 1), p: 1, d: 1 };
      dirty = true;
    }
  }
  return dirty;
}

class SessionRejected extends Error {}

async function post(since: number, changes: object[]) {
  const token = sessionToken();
  if (!token) throw new SessionRejected('Not signed in');
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ since, changes }),
  });
  if (res.status === 401) throw new SessionRejected('Session expired');
  const body = (await res.json().catch(() => ({}))) as {
    changes?: RemoteChange[];
    cursor?: number;
    hasMore?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? `Sync failed (${res.status})`);
  return { changes: body.changes ?? [], cursor: body.cursor ?? since, hasMore: !!body.hasMore };
}

// ---------- engine ----------

/** Mount once (in App). Syncs while signed in: on change, on focus, and every few seconds. */
export function useCloudSync() {
  const { state, dispatch } = useStore();
  const { session } = useAccount();
  const userId = session && !session.expired ? session.user.id : null;

  const stateRef = useRef(state);
  const metaRef = useRef<Meta | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    metaRef.current = userId ? loadMeta(userId) : null;
  }, [userId]);

  // Turn remote records into a store update; returns false when nothing actually changed locally.
  const applyRemote = (meta: Meta, changes: RemoteChange[], mode: 'merge' | 'replace') => {
    const goals: GoalRecord[] = [];
    const todos: Todo[] = [];
    const deleteGoals: string[] = [];
    const deleteTodos: string[] = [];
    let settings: State['settings'] | undefined;
    for (const c of changes) {
      const k = key(c.kind, c.id);
      const local = meta.records[k];
      const h = c.deleted ? '' : hash(c.data);
      if (local && local.h === h && !!local.d === c.deleted) {
        // Same content (usually our own write echoed back): nothing to apply or upload.
        meta.records[k] = { h, u: Math.max(local.u, c.updated_at), ...(c.deleted ? { d: 1 } : {}) };
        continue;
      }
      if (mode === 'merge' && local?.p && local.u >= c.updated_at) continue; // our newer edit wins; it's queued
      meta.records[k] = { h, u: c.updated_at, ...(c.deleted ? { d: 1 } : {}) };
      if (c.kind === 'goal') {
        if (c.deleted) deleteGoals.push(c.id);
        else goals.push(c.data as GoalRecord);
      } else if (c.kind === 'todo') {
        if (c.deleted) deleteTodos.push(c.id);
        else todos.push(c.data as Todo);
      } else if (!c.deleted) {
        settings = c.data as State['settings'];
      }
    }
    if (mode === 'replace') {
      dispatch({ type: 'sync/replace', goals, todos, settings });
      return true;
    }
    if (!goals.length && !todos.length && !deleteGoals.length && !deleteTodos.length && !settings) return false;
    dispatch({ type: 'sync/apply', goals, todos, deleteGoals, deleteTodos, settings });
    return true;
  };

  const syncNow = async () => {
    const meta = metaRef.current;
    if (!meta || currentUserId() !== meta.userId) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setSyncStatus({ state: 'syncing' });
    try {
      if (!meta.initialized) {
        // First sync on this device for this account: pull everything before uploading anything.
        const remote: RemoteChange[] = [];
        let cursor = 0;
        for (let page = 0; page < 50; page++) {
          const r = await post(cursor, []);
          remote.push(...r.changes);
          cursor = r.cursor;
          if (!r.hasMore) break;
        }
        const hasRemoteData = remote.some((c) => !c.deleted);
        // A device with no todos yet (just the starter categories) adopts the account's data
        // instead of uploading duplicate "Work"/"Personal" categories.
        const pristine = stateRef.current.todos.length === 0;
        const changed = hasRemoteData ? applyRemote(meta, remote, pristine ? 'replace' : 'merge') : false;
        meta.cursor = cursor;
        meta.initialized = true;
        saveMeta(meta);
        // If the store changed, the change-tracking effect queues local-only records after re-render.
        if (!changed && markDirty(meta, stateRef.current)) saveMeta(meta);
      }

      for (let round = 0; round < 50; round++) {
        const pending = Object.entries(meta.records).filter(([, m]) => m.p);
        const batch = pending.slice(0, BATCH);
        const current = recordsOf(stateRef.current);
        const sent = new Map<string, number>();
        const changes = batch.map(([k, m]) => {
          sent.set(k, m.u);
          const [kind, ...rest] = k.split(':');
          const rec = current.get(k);
          return { kind, id: rest.join(':'), updated_at: m.u, deleted: !!m.d || !rec, data: m.d || !rec ? null : rec.data };
        });
        const r = await post(meta.cursor, changes);
        for (const [k, u] of sent) {
          const m = meta.records[k];
          if (m && m.u === u) delete m.p; // not edited again while in flight
        }
        applyRemote(meta, r.changes, 'merge');
        meta.cursor = r.cursor;
        saveMeta(meta);
        if (!r.hasMore && pending.length <= BATCH) break;
      }
      setSyncStatus({ state: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      if (e instanceof SessionRejected) {
        markSessionExpired();
        setSyncStatus({ state: 'error', error: 'Signed out. Sign in again to keep syncing.' });
      } else if (e instanceof TypeError || !navigator.onLine) {
        setSyncStatus({ state: 'offline' });
      } else {
        setSyncStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        schedule(0);
      }
    }
  };

  const schedule = (ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void engine.current.syncNow(), ms);
  };

  const engine = useRef({ syncNow, schedule });
  useEffect(() => {
    engine.current = { syncNow, schedule };
  });

  // Local edits → queue + debounced push.
  useEffect(() => {
    const meta = metaRef.current;
    if (!userId || !meta?.initialized) return;
    if (markDirty(meta, state)) {
      saveMeta(meta);
      engine.current.schedule(PUSH_DEBOUNCE_MS);
    }
  }, [state, userId]);

  // Start, poll, and resync on focus / reconnect.
  useEffect(() => {
    if (!userId) return;
    const { schedule: kick } = engine.current;
    kick(0);
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') void engine.current.syncNow();
    }, POLL_MS);
    const wake = () => {
      if (document.visibilityState === 'visible') engine.current.schedule(0);
    };
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(tick);
      clearTimeout(timer.current);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [userId]);

  // Sign out on this device: forget the account and its local copy (the cloud copy stays).
  useEffect(() => {
    signOutHandler = () => {
      clearTimeout(timer.current);
      localStorage.removeItem(META_KEY);
      metaRef.current = null;
      clearSession();
      forgetGoogle();
      dispatch({ type: 'sync/clear' });
    };
    return () => {
      signOutHandler = null;
    };
  }, [dispatch]);
}

let signOutHandler: (() => void) | null = null;

/** Sign out of the app account on this device (local data is removed; it stays in the cloud). */
export function signOut() {
  signOutHandler?.();
}
