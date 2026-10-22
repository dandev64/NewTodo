import { useMemo, useState } from 'react';
import type { Goal, Todo } from '../types';
import {
  WEEKDAY_LETTERS, addDays, addMonths, formatMonth, fromKey, monthGrid, startOfMonth, todayKey, weekOf,
} from '../lib/date';
import { CheckIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from './icons';

type DayStat = { total: number; done: number; color: string };

type Props = {
  selected: string;
  onSelect: (key: string) => void;
  todos: Todo[];
  goals: Goal[];
  /** Days that have Google Calendar events; shown as a small dot. */
  eventDays?: Set<string>;
};

const FALLBACK_COLOR = '#3d7cf5';

export function Calendar({ selected, onSelect, todos, goals, eventDays }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => startOfMonth(fromKey(selected)));
  const today = todayKey();

  const stats = useMemo(() => {
    const goalColor = new Map(goals.map((g) => [g.id, g.color]));
    const perDay = new Map<string, { total: number; done: number; byGoal: Map<string, number> }>();
    for (const t of todos) {
      if (!goalColor.has(t.goalId)) continue;
      let s = perDay.get(t.date);
      if (!s) perDay.set(t.date, (s = { total: 0, done: 0, byGoal: new Map() }));
      s.total++;
      if (t.done) s.done++;
      s.byGoal.set(t.goalId, (s.byGoal.get(t.goalId) ?? 0) + 1);
    }
    const out = new Map<string, DayStat>();
    for (const [date, s] of perDay) {
      // Colour a completed day with whichever goal had the most todos that day.
      let best = '';
      let bestN = 0;
      for (const [g, n] of s.byGoal) if (n > bestN) [best, bestN] = [g, n];
      out.set(date, { total: s.total, done: s.done, color: goalColor.get(best) ?? FALLBACK_COLOR });
    }
    return out;
  }, [todos, goals]);

  const days = view === 'month' ? monthGrid(cursor) : weekOf(selected);
  const titleDate = view === 'month' ? cursor : fromKey(selected);
  const monthPrefix = formatMonthKey(titleDate);
  const monthDone = todos.filter((t) => t.done && t.date.startsWith(monthPrefix)).length;

  const select = (key: string) => {
    onSelect(key);
    setCursor(startOfMonth(fromKey(key)));
  };
  const step = (dir: 1 | -1) => {
    if (view === 'month') setCursor(addMonths(cursor, dir));
    else select(addDays(selected, dir * 7));
  };
  const toggleView = () => {
    setView(view === 'month' ? 'week' : 'month');
    setCursor(startOfMonth(fromKey(selected)));
  };

  return (
    <section className="calendar">
      <div className="cal-head">
        <div className="cal-title">
          <span>{formatMonth(titleDate)}</span>
          <span className="cal-month-done" title="Completed this month">
            <CheckIcon size={12} strokeWidth={3} /> {monthDone}
          </span>
        </div>
        <div className="cal-actions">
          {selected !== today && (
            <button className="pill-btn" onClick={() => select(today)}>Today</button>
          )}
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAY_LETTERS.map((w, i) => (
          <div key={i} className="weekday">{w}</div>
        ))}
        {days.map((key) => {
          const s = stats.get(key);
          const outside = view === 'month' && fromKey(key).getMonth() !== cursor.getMonth();
          const cls = ['day', key === selected && 'selected', key === today && 'today', outside && 'outside']
            .filter(Boolean)
            .join(' ');
          return (
            <button key={key} className={cls} onClick={() => select(key)}>
              <DayIcon stat={s} />
              <span className="day-num">{fromKey(key).getDate()}</span>
              <span className={`event-dot ${eventDays?.has(key) ? 'on' : ''}`} />
            </button>
          );
        })}
      </div>

      <button className="cal-toggle" onClick={toggleView} aria-label={view === 'month' ? 'Show week' : 'Show month'}>
        {view === 'month' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </section>
  );
}

function DayIcon({ stat }: { stat?: DayStat }) {
  if (!stat || stat.total === 0) return <span className="day-icon" />;
  if (stat.done === stat.total) {
    return (
      <span className="day-icon complete" style={{ background: stat.color }}>
        <CheckIcon size={14} strokeWidth={3.5} />
      </span>
    );
  }
  return <span className="day-icon pending">{stat.total - stat.done}</span>;
}

function formatMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
