import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Goal, RepeatRule, State, Todo, TodoSource, TodoStatus } from './types';
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
  | {
      type: 'todo/add';
      goalId: string;
      date: string;
      title: string;
      status?: TodoStatus;
      /** Set when the todo was imported from a calendar event. */
      source?: TodoSource;
      externalId?: string;
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
  | { type: 'reset' };

function nextOrder(todos: Todo[], goalId: string, date: string) {
  let max = -1;
  for (const t of todos) if (t.goalId === goalId && t.date === date) max = Math.max(max, t.order);
  return max + 1;
}

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
    case 'goal/delete':
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== action.id),
        todos: state.todos.filter((t) => t.goalId !== action.id),
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
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };
    case 'todo/deleteFollowing': {
      const src = state.todos.find((t) => t.id === action.id);
      if (!src) return state;
      return {
        ...state,
        todos: state.todos.filter(
          (t) => t.id !== src.id && !(src.seriesId && t.seriesId === src.seriesId && t.date >= src.date),
        ),
      };
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
      };
      return { ...state, todos: [...state.todos, copy] };
    }
    case 'todo/repeat': {
      const src = state.todos.find((t) => t.id === action.id);
      if (!src) return state;
      const { rule } = action;
      const oldSeries = src.seriesId;
      // Drop unfinished future instances of the old series; they get regenerated below.
      let todos = state.todos.filter(
        (t) => !(oldSeries && t.seriesId === oldSeries && t.id !== src.id && t.date > src.date && !t.done),
      );
      if (!rule) {
        return {
          ...state,
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
        });
      }
      return { ...state, todos };
    }
    case 'reset':
      return initialState();
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
