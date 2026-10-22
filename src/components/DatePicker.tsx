import { useState } from 'react';
import { WEEKDAY_LETTERS, addMonths, formatMonth, fromKey, monthGrid, startOfMonth, todayKey } from '../lib/date';
import { ChevronLeft, ChevronRight } from './icons';

type Props = {
  value: string;
  onPick: (key: string) => void;
};

export function DatePicker({ value, onPick }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(fromKey(value)));
  const today = todayKey();

  return (
    <div className="picker">
      <div className="picker-head">
        <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span>{formatMonth(cursor)}</span>
        <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="picker-grid">
        {WEEKDAY_LETTERS.map((w, i) => (
          <div key={i} className="weekday">{w}</div>
        ))}
        {monthGrid(cursor).map((key) => {
          const outside = fromKey(key).getMonth() !== cursor.getMonth();
          const cls = ['picker-day', key === value && 'current', key === today && 'today', outside && 'outside']
            .filter(Boolean)
            .join(' ');
          return (
            <button key={key} className={cls} onClick={() => onPick(key)}>
              {fromKey(key).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
