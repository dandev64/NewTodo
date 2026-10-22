export type Goal = {
  id: string;
  title: string;
  color: string;
  createdAt: number;
};

export type RepeatFreq = 'daily' | 'weekly' | 'monthly';

export type RepeatRule = {
  freq: RepeatFreq;
  /** 0 = Sunday … 6 = Saturday. Used when freq is 'weekly'. */
  weekdays: number[];
  /** Inclusive end date, YYYY-MM-DD. */
  until: string;
};

export type TodoSource = 'local' | 'google' | 'microsoft';

/** Kanban column. Derived from `done` + `inProgress`; see lib/status.ts. */
export type TodoStatus = 'todo' | 'doing' | 'done';

export type Todo = {
  id: string;
  goalId: string;
  title: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  done: boolean;
  /** Only meaningful while `done` is false. */
  inProgress?: boolean;
  order: number;
  createdAt: number;
  /** Shared by every instance generated from the same repeat rule. */
  seriesId?: string;
  repeat?: RepeatRule;
  /** Reserved for calendar sync (Google Calendar / Microsoft). */
  source?: TodoSource;
  externalId?: string;
};

export type State = {
  version: 1;
  goals: Goal[];
  todos: Todo[];
};
