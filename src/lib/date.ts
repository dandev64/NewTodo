import type { RepeatRule } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Every date shown in a Sunday-first month grid, including leading/trailing days. */
export function monthGrid(month: Date): string[] {
  const first = startOfMonth(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  const start = toKey(new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay()));
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

export function weekOf(key: string): string[] {
  const start = addDays(key, -fromKey(key).getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const formatMonth = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export const formatLong = (key: string) =>
  fromKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** "Today" / "Tomorrow" / "Yesterday", otherwise e.g. "Fri, Oct 23". */
export function relativeLabel(key: string): string {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return formatLong(key);
}

/** "14:05" → "2:05 PM". */
export function formatHM(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const MAX_REPEATS = 400;

/** Dates strictly after `start` up to `rule.until` that match the rule. */
export function repeatDates(start: string, rule: RepeatRule): string[] {
  const out: string[] = [];
  const startDay = fromKey(start).getDate();
  let cur = addDays(start, 1);
  while (cur <= rule.until && out.length < MAX_REPEATS) {
    const d = fromKey(cur);
    const match =
      rule.freq === 'daily' ||
      (rule.freq === 'weekly' && rule.weekdays.includes(d.getDay())) ||
      (rule.freq === 'monthly' && d.getDate() === startDay);
    if (match) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
