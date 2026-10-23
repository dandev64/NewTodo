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

/**
 * Present when the todo should appear in Google Calendar. The sync engine
 * (lib/gcalSync.ts) creates/updates the event whenever `syncedSig` is stale.
 */
export type TodoGcal = {
  eventId?: string;
  /** Signature of the event content last written to (or read from) Google. */
  syncedSig?: string;
  /** When syncedSig was set (ms). Fetched Google data older than this is ignored for this todo. */
  syncedAt?: number;
  error?: string;
  /** Signature that produced `error`; we don't retry until the todo changes. */
  errorSig?: string;
};

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
  /** Start time, HH:MM (24h). Absent = an all-day / anytime task. */
  time?: string;
  /** Minutes; only used with `time`. */
  duration?: number;
  /** Where the todo came from. `google` = imported from a Google Calendar event (`externalId` = event id). */
  source?: TodoSource;
  externalId?: string;
  /** Pushed to Google Calendar. */
  gcal?: TodoGcal;
};

export type Settings = {
  /** Put newly created todos in Google Calendar automatically. */
  autoGcal?: boolean;
};

export type State = {
  version: 1;
  goals: Goal[];
  todos: Todo[];
  /** Google event ids still to be deleted (outbox, processed when signed in). */
  gcalDeletes?: string[];
  settings?: Settings;
};
