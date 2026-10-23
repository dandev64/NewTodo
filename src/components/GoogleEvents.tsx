import type { Todo } from '../types';
import { connectGoogle, formatTime, useGoogleAuth, type GEvent } from '../lib/google';
import { CheckIcon, PlusIcon, RepeatIcon } from './icons';

export { useMonthEvents } from '../lib/gcalPull';

type Props = {
  date: string;
  events: GEvent[];
  loading: boolean;
  error: string | null;
  todos: Todo[];
  onRefresh: () => void;
  onImport: (event: GEvent) => void;
};

export function GoogleDaySection({ date, events, loading, error, todos, onRefresh, onImport }: Props) {
  const google = useGoogleAuth();
  if (!google.connected) return null;

  if (!google.valid) {
    return (
      <div className="gcal">
        <div className="gcal-expired">
          <span>Google Calendar session expired</span>
          <button className="pill-btn" onClick={connectGoogle}>Reconnect</button>
        </div>
      </div>
    );
  }

  const imported = new Set(todos.filter((t) => t.source === 'google').map((t) => t.externalId));
  const dayEvents = events.filter((e) => e.days.includes(date));

  return (
    <div className="gcal">
      <div className="gcal-head">
        <span className="goal-chip static gcal-chip">
          <span className="gcal-logo" /> Google Calendar
        </span>
        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh events" title="Refresh">
          <RepeatIcon size={14} />
        </button>
      </div>
      {!google.allCalendars && (
        <div className="gcal-expired gcal-upgrade">
          <span>Showing your main calendar only.</span>
          <button className="pill-btn" onClick={connectGoogle}>Show all calendars</button>
        </div>
      )}
      {error && <p className="gcal-msg error">{error}</p>}
      {!error && loading && <p className="gcal-msg">Loading events…</p>}
      {!error && !loading && dayEvents.length === 0 && <p className="gcal-msg">No events</p>}
      <ul>
        {dayEvents.map((e) => {
          const done = imported.has(e.id);
          return (
            <li key={e.id} className="gcal-event">
              <span className="gcal-time">{e.allDay ? 'All day' : formatTime(e.start)}</span>
              <a
                className="gcal-title"
                href={e.link}
                target="_blank"
                rel="noreferrer"
                style={e.color ? { borderLeftColor: e.color } : undefined}
              >
                {e.title}
              </a>
              <button
                className={`icon-btn gcal-add ${done ? 'added' : ''}`}
                disabled={done}
                onClick={() => onImport(e)}
                aria-label={done ? 'Already added as a todo' : 'Add as todo'}
                title={done ? 'Added as a todo' : 'Add as todo'}
              >
                {done ? <CheckIcon size={14} strokeWidth={3} /> : <PlusIcon size={16} />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
