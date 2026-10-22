import { useState, type ReactNode } from 'react';
import type { Goal, RepeatFreq, Todo } from '../types';
import { useStore } from '../store';
import { WEEKDAY_SHORT, addDays, formatLong, fromKey, todayKey } from '../lib/date';
import { STATUSES, statusOf } from '../lib/status';
import { BottomSheet } from './BottomSheet';
import { DatePicker } from './DatePicker';
import { ArrowRightIcon, CalendarIcon, CopyIcon, EditIcon, RepeatIcon, TrashIcon } from './icons';

export type SheetMode = 'actions' | 'move' | 'copy' | 'repeat' | 'delete';

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
      </div>
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
