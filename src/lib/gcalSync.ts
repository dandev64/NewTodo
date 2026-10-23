// Pushes todos to Google Calendar. Each todo with `gcal` set is mirrored as an event:
// all-day when it has no time, otherwise a timed event. A signature of the event
// content is stored after each write, so any change to the todo (title, date, time,
// done, goal) is detected by comparing signatures. Deletions go through the
// `gcalDeletes` outbox so they still happen if the user was signed out at the time.
import { useEffect, useRef } from 'react';
import type { Goal, Todo } from '../types';
import { useStore } from '../store';
import { addDays, fromKey, toKey, todayKey } from './date';
import {
  DONE_PREFIX, GoogleAuthExpired, GoogleEventGone, TODO_ID_PROP, deleteEvent, saveEvent, useGoogleAuth,
  type AppEvent, type EventInput,
} from './google';
import { useAllMonthEntries, useGoogleAutoRefresh, useMonthEvents } from './gcalPull';

// Google Calendar's fixed event palette (colorId → hex).
const EVENT_COLORS: Record<string, string> = {
  1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e',
  7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000',
};

function nearestColorId(hex: string): string | undefined {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  if ([r, g, b].some(Number.isNaN)) return undefined;
  let best: string | undefined;
  let bestD = Infinity;
  for (const [id, c] of Object.entries(EVENT_COLORS)) {
    const [r2, g2, b2] = rgb(c);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) [best, bestD] = [id, d];
  }
  return best;
}

/** "YYYY-MM-DDTHH:MM:00" in local time, `minutes` after the todo's start. */
function localDateTime(date: string, time: string, minutes = 0): string {
  const [h, m] = time.split(':').map(Number);
  const d = fromKey(date);
  d.setHours(h, m + minutes, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export const DEFAULT_DURATION = 60;

export function buildEvent(todo: Todo, goal: Goal | undefined): EventInput {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timed = !!todo.time;
  return {
    summary: `${todo.done ? DONE_PREFIX : ''}${todo.title}`,
    description: goal ? `Goal: ${goal.title}\nFrom TODO mate` : 'From TODO mate',
    start: timed
      ? { dateTime: localDateTime(todo.date, todo.time!), timeZone, date: null }
      : { date: todo.date, dateTime: null, timeZone: null },
    end: timed
      ? { dateTime: localDateTime(todo.date, todo.time!, todo.duration ?? DEFAULT_DURATION), timeZone, date: null }
      : { date: addDays(todo.date, 1), dateTime: null, timeZone: null },
    colorId: goal ? nearestColorId(goal.color) : undefined,
    extendedProperties: { private: { [TODO_ID_PROP]: todo.id } },
  };
}

export const eventSignature = (todo: Todo, goal: Goal | undefined) => {
  // timeZone is excluded so the signature is stable across devices in the same zone setup.
  const e = buildEvent(todo, goal);
  return JSON.stringify([e.summary, e.description, e.start.date ?? e.start.dateTime, e.end.date ?? e.end.dateTime, e.colorId]);
};

export type GcalState = 'synced' | 'pending' | 'error';

export function gcalState(todo: Todo, goal: Goal | undefined): GcalState | null {
  if (!todo.gcal) return null;
  const sig = eventSignature(todo, goal);
  if (todo.gcal.error && todo.gcal.errorSig === sig) return 'error';
  return todo.gcal.eventId && todo.gcal.syncedSig === sig ? 'synced' : 'pending';
}

/** What changed in Google for this todo's event, or null if it matches the todo. */
function pulledPatch(todo: Todo, ev: AppEvent) {
  const patch = {
    title: ev.title,
    done: ev.done,
    date: ev.date,
    time: ev.time,
    duration: ev.time ? ev.duration : undefined,
  };
  const same =
    patch.title === todo.title &&
    patch.done === todo.done &&
    patch.date === todo.date &&
    patch.time === todo.time &&
    (!patch.time || patch.duration === (todo.duration ?? DEFAULT_DURATION));
  return same ? null : patch;
}

/** Mount once (in App). Pushes todo changes to Google and pulls Google-side edits back. */
export function useGoogleSync() {
  const { state, dispatch } = useStore();
  const { token, canWrite } = useGoogleAuth();
  const months = useAllMonthEntries();
  useGoogleAutoRefresh();
  // Keep this month's events fresh even when Home isn't open, so edits in Google come back.
  useMonthEvents(todayKey().slice(0, 7));
  const inFlight = useRef(new Set<string>());
  // Failed syncs normally wait for the todo to change; retry each one once per app session too.
  const retried = useRef(new Set<string>());
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
  });

  useEffect(() => {
    if (!token || !canWrite) return;
    const goals = new Map(state.goals.map((g) => [g.id, g]));

    for (const todo of state.todos) {
      if (!todo.gcal) continue;
      const goal = goals.get(todo.goalId);
      const status = gcalState(todo, goal);
      const sig = eventSignature(todo, goal);
      if (status === 'error') {
        if (retried.current.has(`${todo.id}:${sig}`)) continue;
        retried.current.add(`${todo.id}:${sig}`);
      } else if (status !== 'pending') continue;
      const key = `todo:${todo.id}`;
      if (inFlight.current.has(key)) continue;
      inFlight.current.add(key);

      saveEvent(token, todo.gcal.eventId, buildEvent(todo, goal))
        .then((eventId) => {
          inFlight.current.delete(key);
          // The todo may have been deleted or taken off the calendar while we were saving.
          const now = latest.current.todos.find((t) => t.id === todo.id);
          if (!now?.gcal) {
            if (!todo.gcal!.eventId) deleteEvent(token, eventId).catch(() => {});
            return;
          }
          dispatch({ type: 'gcal/synced', id: todo.id, eventId, sig, at: Date.now() });
        })
        .catch((e: unknown) => {
          inFlight.current.delete(key);
          if (e instanceof GoogleAuthExpired) return; // retried after reconnect
          if (e instanceof GoogleEventGone) {
            // Deleted on the Google side: respect that and stop syncing this todo.
            dispatch({ type: 'gcal/unlink', id: todo.id });
            return;
          }
          dispatch({ type: 'gcal/error', id: todo.id, sig, message: e instanceof Error ? e.message : String(e) });
        });
    }

    for (const eventId of state.gcalDeletes ?? []) {
      const key = `del:${eventId}`;
      if (inFlight.current.has(key)) continue;
      inFlight.current.add(key);
      deleteEvent(token, eventId)
        .then(() => {
          inFlight.current.delete(key);
          dispatch({ type: 'gcal/deleted', eventId });
        })
        .catch(() => {
          // Keep it in the outbox; it's retried on the next change or reconnect.
          inFlight.current.delete(key);
        });
    }
  }, [state.todos, state.goals, state.gcalDeletes, token, canWrite, dispatch]);

  // Google → todo: apply edits made in Google Calendar to events we created.
  useEffect(() => {
    if (!token) return;
    const goals = new Map(state.goals.map((g) => [g.id, g]));
    const todos = new Map(state.todos.map((t) => [t.id, t]));
    const handled = new Set<string>();

    for (const m of months) {
      if (m.token !== token || !m.data) continue;
      const { appEvents, from, to } = m.data;
      const byId = new Map(appEvents.map((e) => [e.id, e]));
      // If the user turned the event into a recurring one in Google, its instances carry the original id here.
      const recurring = new Set(appEvents.map((e) => e.recurringEventId).filter(Boolean));

      for (const todo of todos.values()) {
        const g = todo.gcal;
        if (!g?.eventId || handled.has(todo.id)) continue;
        // Only trust data fetched after our last write/read for this todo, and never override unsynced local edits.
        if ((g.syncedAt ?? 0) >= m.fetchStartedAt) continue;
        const goal = goals.get(todo.goalId);
        if (gcalState(todo, goal) !== 'synced') continue;

        const ev = byId.get(g.eventId);
        if (!ev) {
          const inWindow = todo.date >= from && todo.date < to;
          if (inWindow && !recurring.has(g.eventId)) {
            // Deleted in Google: keep the todo, just stop syncing it.
            handled.add(todo.id);
            dispatch({ type: 'gcal/unlink', id: todo.id });
          }
          continue;
        }
        handled.add(todo.id);
        const patch = pulledPatch(todo, ev);
        if (!patch) continue;
        const sig = eventSignature({ ...todo, ...patch }, goal);
        dispatch({ type: 'gcal/pulled', id: todo.id, patch, sig, at: Date.now() });
      }
    }
  }, [months, state.todos, state.goals, token, dispatch]);
}
