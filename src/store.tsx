import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Goal, RepeatRule, Settings, State, Todo, TodoSource, TodoStatus } from './types';
import { repeatDates } from './lib/date';
import { statusFields } from './lib/status';

const STORAGE_KEY = 'todomate.v1';

export const GOAL_COLORS = [
  '#ff6b6b', '#ff9f43', '#f7c548', '#2ecc71', '#1abc9c', '#48c6ef',
  '#3d7cf5', '#7b61ff', '#f368e0', '#8395a7', '#222222',
];

export const uid = () => crypto.randomUUID();

export type Action =
  | { type: 'goal/add'; title: string; color: string }
  | { type: 'goal/update'; id: string; patch: Partial<Omit<Goal, 'id'>> }
  | { type: 'goal/delete'; id: string }
  /** Move a category one place up (-1) or down (1) among the active categories. */
  | { type: 'goal/move'; id: string; dir: -1 | 1 }
  | {
      type: 'todo/add';
      goalId: string;
      date: string;
      title: string;
      status?: TodoStatus;
      /** Set when the todo was imported from a calendar event. */
      source?: TodoSource;
      externalId?: string;
      time?: string;
      duration?: number;
    }
  | { type: 'todo/rename'; id: string; title: string }
  | { type: 'todo/update'; id: string; patch: Pick<Todo, 'title' | 'goalId' | 'date'> }
  | { type: 'todo/toggle'; id: string }
  | { type: 'todo/setStatus'; id: string; status: TodoStatus }
  | { type: 'todo/delete'; id: string }
  | { type: 'todo/deleteFollowing'; id: string }
  | { type: 'todo/move'; id: string; date: string }
  | { type: 'todo/copy'; id: string; date: string }
  | { type: 'todo/repeat'; id: string; rule: RepeatRule | null }
  /** Set the time (null = all day) and whether the todo is in Google Calendar. */
  | { type: 'todo/schedule'; id: string; time: string | null; duration: number; gcal: boolean }
  | { type: 'gcal/synced'; id: string; eventId: string; sig: string; at: number }
  /** Apply an edit made to the todo's event in Google Calendar. */
  | {
      type: 'gcal/pulled';
      id: string;
      patch: Pick<Todo, 'title' | 'done' | 'date' | 'time' | 'duration'>;
      sig: string;
      at: number;
    }
  | { type: 'gcal/error'; id: string; sig: string; message: string }
  | { type: 'gcal/unlink'; id: string }
  | { type: 'gcal/deleted'; eventId: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  /** Merge records pulled from the cloud (see lib/cloudSync.ts). */
  | {
      type: 'sync/apply';
      goals: GoalRecord[];
      todos: Todo[];
      deleteGoals: string[];
      deleteTodos: string[];
      settings?: Settings;
    }
  /** Replace local data with the account's data (first sign-in on a device with no todos). */
  | { type: 'sync/replace'; goals: GoalRecord[]; todos: Todo[]; settings?: Settings }
  /** Signed out: drop local data without touching Google Calendar. */
  | { type: 'sync/clear' }
  | { type: 'reset' };

/** A category as stored in the cloud: `pos` carries its place in the list. */
export type GoalRecord = Goal & { pos?: number };

/** Order categories by their synced position (ties broken by id so every device agrees). */
function orderGoals(entries: { goal: Goal; pos: number }[]): Goal[] {
  return entries
    .sort((a, b) => a.pos - b.pos || (a.goal.id < b.goal.id ? -1 : a.goal.id > b.goal.id ? 1 : 0))
    .map((e) => e.goal);
}

const stripPos = ({ pos: _pos, ...goal }: GoalRecord): Goal => goal;

function nextOrder(todos: Todo[], goalId: string, date: string) {
  let max = -1;
  for (const t of todos) if (t.goalId === goalId && t.date === date) max = Math.max(max, t.order);
  return max + 1;
}

/** Remove todos and queue deletion of any Google events they were linked to. */
function removeTodos(state: State, keep: (t: Todo) => boolean, todos = state.todos): State {
  const removed = todos.filter((t) => !keep(t));
  const eventIds = removed.flatMap((t) => (t.gcal?.eventId ? [t.gcal.eventId] : []));
  return {
    ...state,
    todos: todos.filter(keep),
    gcalDeletes: eventIds.length ? [...(state.gcalDeletes ?? []), ...eventIds] : state.gcalDeletes,
  };
}

/** Fields a copy/repeat instance inherits from its source todo. */
const inherited = (src: Todo) => ({
  time: src.time,
  duration: src.duration,
  gcal: src.gcal ? {} : undefined,
});

function initialState(): State {
  const now = Date.now();
  return {
    version: 1,
    goals: [
      { id: uid(), title: 'Work', color: '#3d7cf5', createdAt: now },
      { id: uid(), title: 'Personal', color: '#ff6b6b', createdAt: now + 1 },
    ],
    todos: [],
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed.version === 1 && Array.isArray(parsed.goals) && Array.isArray(parsed.todos)) return parsed;
    }
  } catch {
    // fall through to a fresh state
  }
  return initialState();
}

function reducer(state: State, action: Action): State {
  const mapTodo = (id: string, fn: (t: Todo) => Todo) => ({
    ...state,
    todos: state.todos.map((t) => (t.id === id ? fn(t) : t)),
  });

  switch (action.type) {
    case 'goal/add':
      return {
        ...state,
        goals: [...state.goals, { id: uid(), title: action.title, color: action.color, createdAt: Date.now() }],
      };
    case 'goal/update':
      return { ...state, goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)) };
    case 'goal/move': {
      const goals = [...state.goals];
      const i = goals.findIndex((g) => g.id === action.id);
      if (i < 0) return state;
      // Step over ended categories so the move is visible in the active list.
      let j = i + action.dir;
      while (j >= 0 && j < goals.length && goals[j].archived) j += action.dir;
      if (j < 0 || j >= goals.length) return state;
      [goals[i], goals[j]] = [goals[j], goals[i]];
      return { ...state, goals };
    }
    case 'goal/delete':
      return {
        ...removeTodos(state, (t) => t.goalId !== action.id),
        goals: state.goals.filter((g) => g.id !== action.id),
      };

    case 'todo/add': {
      const todo: Todo = {
        id: uid(),
        goalId: action.goalId,
        title: action.title,
        date: action.date,
        ...statusFields(action.status ?? 'todo'),
        order: nextOrder(state.todos, action.goalId, action.date),
        createdAt: Date.now(),
        source: action.source ?? 'local',
        externalId: action.externalId,
        time: action.time,
        duration: action.time ? action.duration : undefined,
        // Imported events are already in Google, so never push those back.
        gcal: state.settings?.autoGcal && action.source !== 'google' ? {} : undefined,
      };
      return { ...state, todos: [...state.todos, todo] };
    }
    case 'todo/rename':
      return mapTodo(action.id, (t) => ({ ...t, title: action.title }));
    case 'todo/update':
      return mapTodo(action.id, (t) => {
        const { title, goalId, date } = action.patch;
        const relocated = goalId !== t.goalId || date !== t.date;
        return { ...t, title, goalId, date, order: relocated ? nextOrder(state.todos, goalId, date) : t.order };
      });
    case 'todo/toggle':
      return mapTodo(action.id, (t) => ({ ...t, done: !t.done, inProgress: false }));
    case 'todo/setStatus':
      return mapTodo(action.id, (t) => ({ ...t, ...statusFields(action.status) }));
    case 'todo/delete':
      return removeTodos(state, (t) => t.id !== action.id);
    case 'todo/deleteFollowing': {
      const src = state.todos.find((t) => t.id === action.id);
      if (!src) return state;
      return removeTodos(
        state,
        (t) => t.id !== src.id && !(src.seriesId && t.seriesId === src.seriesId && t.date >= src.date),
      );
    }
    case 'todo/move':
      return mapTodo(action.id, (t) => ({
        ...t,
        date: action.date,
        order: nextOrder(state.todos, t.goalId, action.date),
      }));
    case 'todo/copy': {
      const src = state.todos.find((t) => t.id === action.id);
      if (!src) return state;
      const copy: Todo = {
        id: uid(),
        goalId: src.goalId,
        title: src.title,
        date: action.date,
        done: false,
        order: nextOrder(state.todos, src.goalId, action.date),
        createdAt: Date.now(),
        source: 'local',
        ...inherited(src),
      };
      return { ...state, todos: [...state.todos, copy] };
    }
    case 'todo/repeat': {
      const src = state.todos.find((t) => t.id === action.id);
      if (!src) return state;
      const { rule } = action;
      const oldSeries = src.seriesId;
      // Drop unfinished future instances of the old series; they get regenerated below.
      const pruned = removeTodos(
        state,
        (t) => !(oldSeries && t.seriesId === oldSeries && t.id !== src.id && t.date > src.date && !t.done),
      );
      let todos = pruned.todos;
      if (!rule) {
        return {
          ...pruned,
          todos: todos.map((t) =>
            t.id === src.id || (oldSeries && t.seriesId === oldSeries)
              ? { ...t, repeat: undefined, seriesId: undefined }
              : t,
          ),
        };
      }
      const seriesId = oldSeries ?? uid();
      todos = todos.map((t) => (t.id === src.id ? { ...t, seriesId, repeat: rule } : t));
      const taken = new Set(todos.filter((t) => t.seriesId === seriesId).map((t) => t.date));
      for (const date of repeatDates(src.date, rule)) {
        if (taken.has(date)) continue;
        todos.push({
          id: uid(),
          goalId: src.goalId,
          title: src.title,
          date,
          done: false,
          order: nextOrder(todos, src.goalId, date),
          createdAt: Date.now(),
          seriesId,
          repeat: rule,
          source: 'local',
          ...inherited(src),
        });
      }
      return { ...pruned, todos };
    }

    case 'todo/schedule': {
      const src = state.todos.find((t) => t.id === action.id);
      if (!src) return state;
      const next = mapTodo(action.id, (t) => ({
        ...t,
        time: action.time ?? undefined,
        duration: action.time ? action.duration : undefined,
        gcal: action.gcal ? (t.gcal ?? {}) : undefined,
      }));
      const unlinked = !action.gcal && src.gcal?.eventId;
      return unlinked ? { ...next, gcalDeletes: [...(state.gcalDeletes ?? []), src.gcal!.eventId!] } : next;
    }
    case 'gcal/synced':
      return mapTodo(action.id, (t) =>
        t.gcal ? { ...t, gcal: { eventId: action.eventId, syncedSig: action.sig, syncedAt: action.at } } : t,
      );
    case 'gcal/pulled':
      return mapTodo(action.id, (t) =>
        t.gcal
          ? {
              ...t,
              ...action.patch,
              inProgress: action.patch.done ? false : t.inProgress,
              order: action.patch.date !== t.date ? nextOrder(state.todos, t.goalId, action.patch.date) : t.order,
              gcal: { eventId: t.gcal.eventId, syncedSig: action.sig, syncedAt: action.at },
            }
          : t,
      );
    case 'gcal/error':
      return mapTodo(action.id, (t) =>
        t.gcal ? { ...t, gcal: { ...t.gcal, error: action.message, errorSig: action.sig } } : t,
      );
    case 'gcal/unlink':
      return mapTodo(action.id, (t) => ({ ...t, gcal: undefined }));
    case 'gcal/deleted':
      return { ...state, gcalDeletes: (state.gcalDeletes ?? []).filter((id) => id !== action.eventId) };
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'sync/apply': {
      const incoming = new Map(action.goals.map((g) => [g.id, g]));
      const dropGoals = new Set(action.deleteGoals);
      const entries = state.goals
        .filter((g) => !dropGoals.has(g.id) && !incoming.has(g.id))
        .map((g) => ({ goal: g, pos: state.goals.indexOf(g) }));
      for (const g of incoming.values()) {
        if (!dropGoals.has(g.id)) entries.push({ goal: stripPos(g), pos: g.pos ?? Number.MAX_SAFE_INTEGER });
      }
      const incomingTodos = new Map(action.todos.map((t) => [t.id, t]));
      const dropTodos = new Set(action.deleteTodos);
      const todos = state.todos
        .filter((t) => !dropTodos.has(t.id))
        .map((t) => incomingTodos.get(t.id) ?? t);
      const known = new Set(todos.map((t) => t.id));
      for (const t of incomingTodos.values()) if (!known.has(t.id) && !dropTodos.has(t.id)) todos.push(t);
      return {
        ...state,
        goals: orderGoals(entries),
        todos,
        settings: action.settings ?? state.settings,
      };
    }
    case 'sync/replace':
      return {
        ...state,
        goals: orderGoals(action.goals.map((g, i) => ({ goal: stripPos(g), pos: g.pos ?? i }))),
        todos: action.todos,
        settings: action.settings ?? state.settings,
      };
    case 'sync/clear':
      return initialState();

    case 'reset':
      // Also remove the events this device put in Google Calendar.
      return { ...initialState(), gcalDeletes: removeTodos(state, () => false).gcalDeletes };
  }
}

const StoreContext = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
