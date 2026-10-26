import { useState, type ReactNode } from 'react';
import type { Goal, RepeatFreq, Todo } from '../types';
import { useStore } from '../store';
import { WEEKDAY_SHORT, addDays, formatHM, formatLong, fromKey, todayKey } from '../lib/date';
import { connectGoogle, useGoogleAuth } from '../lib/google';
import { DEFAULT_DURATION, gcalState } from '../lib/gcalSync';
import { STATUSES, statusOf } from '../lib/status';
import { BottomSheet } from './BottomSheet';
import { DatePicker } from './DatePicker';
import { ArrowRightIcon, CalendarIcon, ChevronDown, ChevronRight, ChevronUp, ClockIcon, CopyIcon, EditIcon, RepeatIcon, TrashIcon } from './icons';

export type SheetMode = 'actions' | 'move' | 'copy' | 'repeat' | 'delete' | 'schedule';

type Props = {
  todo: Todo;
  goal: Goal;
  mode: SheetMode;
  setMode: (mode: SheetMode) => void;
  onEdit: () => void;
  onClose: () => void;
};

export function TodoSheet({ todo, goal, mode, setMode, onEdit, onClose }: Props) {
  const { state, dispatch } = useStore();
  const today = todayKey();
  const overdue = todo.date < today && !todo.done;
  const inSeries = !!todo.seriesId && state.todos.some((t) => t.seriesId === todo.seriesId && t.id !== todo.id);

  const siblings = state.todos
    .filter((t) => t.goalId === todo.goalId && t.date === todo.date)
    .sort((a, b) => a.order - b.order);
  const myIndex = siblings.findIndex((t) => t.id === todo.id);
  const canMoveUp = myIndex > 0;
  const canMoveDown = myIndex >= 0 && myIndex < siblings.length - 1;

  const swapOrder = (dir: -1 | 1) => {
    const ids = siblings.map((t) => t.id);
    const j = myIndex + dir;
    [ids[myIndex], ids[j]] = [ids[j], ids[myIndex]];
    dispatch({ type: 'todo/reorder', goalId: todo.goalId, date: todo.date, ids });
    onClose();
  };

  const title = (
    <span className="sheet-todo-title">
      <span className="dot" style={{ background: goal.color }} />
      {todo.title}
    </span>
  );

  if (mode === 'move' || mode === 'copy') {
    return (
      <BottomSheet title={mode === 'move' ? 'Change date' : 'Do another day too'} onClose={onClose}>
        <DatePicker
          value={todo.date}
          onPick={(date) => {
            dispatch({ type: mode === 'move' ? 'todo/move' : 'todo/copy', id: todo.id, date });
            onClose();
          }}
        />
      </BottomSheet>
    );
  }

  if (mode === 'repeat') {
    return (
      <BottomSheet title="Repeat" onClose={onClose}>
        <RepeatForm todo={todo} onDone={onClose} />
      </BottomSheet>
    );
  }

  if (mode === 'schedule') {
    return (
      <BottomSheet title="Time & Google Calendar" onClose={onClose}>
        <ScheduleForm todo={todo} goal={goal} onDone={onClose} />
      </BottomSheet>
    );
  }

  if (mode === 'delete') {
    return (
      <BottomSheet title={title} onClose={onClose}>
        <div className="sheet-list">
          <button className="sheet-list-btn" onClick={() => { dispatch({ type: 'todo/delete', id: todo.id }); onClose(); }}>
            Delete this todo only
          </button>
          <button
            className="sheet-list-btn danger"
            onClick={() => { dispatch({ type: 'todo/deleteFollowing', id: todo.id }); onClose(); }}
          >
            Delete this and all following
          </button>
        </div>
      </BottomSheet>
    );
  }

  const status = statusOf(todo);

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="segmented status-switch">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            className={status === s.id ? 'active' : ''}
            onClick={() => {
              dispatch({ type: 'todo/setStatus', id: todo.id, status: s.id });
              onClose();
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="action-grid">
        <Action icon={<EditIcon />} label="Edit" onClick={() => { onEdit(); onClose(); }} />
        <Action
          icon={<TrashIcon />}
          label="Delete"
          danger
          onClick={() => {
            if (inSeries) setMode('delete');
            else { dispatch({ type: 'todo/delete', id: todo.id }); onClose(); }
          }}
        />
        <Action
          icon={<ArrowRightIcon />}
          label={overdue ? 'Do it today' : 'Do it tomorrow'}
          onClick={() => {
            dispatch({ type: 'todo/move', id: todo.id, date: overdue ? today : addDays(todo.date, 1) });
            onClose();
          }}
        />
        <Action icon={<CopyIcon />} label="Do another day" onClick={() => setMode('copy')} />
        <Action icon={<CalendarIcon />} label="Change date" onClick={() => setMode('move')} />
        <Action icon={<RepeatIcon />} label="Repeat" onClick={() => setMode('repeat')} />
        {canMoveUp && <Action icon={<ChevronUp size={20} />} label="Move up" onClick={() => swapOrder(-1)} />}
        {canMoveDown && <Action icon={<ChevronDown size={20} />} label="Move down" onClick={() => swapOrder(1)} />}
      </div>
      <button className="sheet-row" onClick={() => setMode('schedule')}>
        <ClockIcon size={18} />
        <span className="sheet-row-label">Time & Google Calendar</span>
        <span className="sheet-row-value">
          {todo.time ? formatHM(todo.time) : 'All day'}
          {todo.gcal && ' · In calendar'}
        </span>
        <ChevronRight size={16} />
      </button>
    </BottomSheet>
  );
}

function Action({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button className={`action ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="action-icon">{icon}</span>
      <span className="action-label">{label}</span>
    </button>
  );
}

const FREQS: { value: RepeatFreq; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function RepeatForm({ todo, onDone }: { todo: Todo; onDone: () => void }) {
  const { dispatch } = useStore();
  const [freq, setFreq] = useState<RepeatFreq>(todo.repeat?.freq ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(todo.repeat?.weekdays ?? [fromKey(todo.date).getDay()]);
  const [until, setUntil] = useState(todo.repeat?.until ?? addDays(todo.date, 28));

  const toggleDay = (d: number) =>
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const valid = until > todo.date && (freq !== 'weekly' || weekdays.length > 0);

  return (
    <div className="repeat-form">
      <div className="segmented">
        {FREQS.map((f) => (
          <button key={f.value} className={freq === f.value ? 'active' : ''} onClick={() => setFreq(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {freq === 'weekly' && (
        <div className="weekday-chips">
          {WEEKDAY_SHORT.map((w, i) => (
            <button key={w} className={weekdays.includes(i) ? 'active' : ''} onClick={() => toggleDay(i)}>
              {w}
            </button>
          ))}
        </div>
      )}
      {freq === 'monthly' && (
        <p className="hint">Every month on day {fromKey(todo.date).getDate()}</p>
      )}

      <label className="field">
        <span>Starts</span>
        <span className="field-value">{formatLong(todo.date)}</span>
      </label>
      <label className="field">
        <span>Ends</span>
        <input type="date" value={until} min={addDays(todo.date, 1)} onChange={(e) => setUntil(e.target.value)} />
      </label>

      <div className="sheet-buttons">
        {todo.repeat && (
          <button className="btn secondary" onClick={() => { dispatch({ type: 'todo/repeat', id: todo.id, rule: null }); onDone(); }}>
            Stop repeating
          </button>
        )}
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            dispatch({ type: 'todo/repeat', id: todo.id, rule: { freq, weekdays, until } });
            onDone();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const durationLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hr`.replace('.5 hr', '½ hr'));

function ScheduleForm({ todo, goal, onDone }: { todo: Todo; goal: Goal; onDone: () => void }) {
  const { dispatch } = useStore();
  const google = useGoogleAuth();
  const [timed, setTimed] = useState(!!todo.time);
  const [time, setTime] = useState(todo.time ?? '09:00');
  const [duration, setDuration] = useState(todo.duration ?? DEFAULT_DURATION);
  const [inCalendar, setInCalendar] = useState(!!todo.gcal);
  const imported = todo.source === 'google';
  const sync = gcalState(todo, goal);

  // What (if anything) stands between the user and syncing.
  const blocker = !google.configured
    ? { text: 'Google Calendar is not set up for this app.' }
    : !google.connected
      ? { text: 'Connect Google Calendar to add todos to it.', action: 'Connect' }
      : !google.valid
        ? { text: 'Google session expired. Changes sync after you reconnect.', action: 'Reconnect' }
        : !google.canWrite
          ? { text: 'Google only allows viewing events right now.', action: 'Allow adding events' }
          : null;

  return (
    <div className="repeat-form">
      <div className="segmented">
        <button className={!timed ? 'active' : ''} onClick={() => setTimed(false)}>All day</button>
        <button className={timed ? 'active' : ''} onClick={() => setTimed(true)}>Set time</button>
      </div>

      {timed && (
        <>
          <label className="field">
            <span>Starts</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Duration</span>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>{durationLabel(m)}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {imported ? (
        <p className="hint">This todo came from a Google Calendar event, so it's already in your calendar.</p>
      ) : (
        <>
          <label className="field switch-field">
            <span>
              Show in Google Calendar
              <span className="field-sub">
                {timed ? 'As an event at this time' : 'As an all-day task'}
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={inCalendar}
              disabled={!google.connected && !inCalendar}
              onChange={(e) => setInCalendar(e.target.checked)}
            />
          </label>
          {todo.gcal && sync && (
            <p className={`hint gcal-status ${sync}`}>
              {sync === 'synced' && '✓ In your Google Calendar'}
              {sync === 'pending' && 'Waiting to sync…'}
              {sync === 'error' && `Couldn't sync: ${todo.gcal.error}`}
            </p>
          )}
          {blocker && (inCalendar || !google.connected) && (
            <div className="gcal-expired">
              <span>{blocker.text}</span>
              {blocker.action && <button className="pill-btn" onClick={connectGoogle}>{blocker.action}</button>}
            </div>
          )}
        </>
      )}

      <div className="sheet-buttons">
        <button
          className="btn primary"
          disabled={timed && !time}
          onClick={() => {
            dispatch({
              type: 'todo/schedule',
              id: todo.id,
              time: timed ? time : null,
              duration,
              gcal: !imported && inCalendar,
            });
            onDone();
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
