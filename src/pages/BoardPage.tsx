import { useState } from 'react';
import type { Goal, Todo, TodoStatus } from '../types';
import { useStore } from '../store';
import { formatHM, formatLong, relativeLabel, todayKey, weekOf } from '../lib/date';
import { STATUSES, statusOf } from '../lib/status';
import { TodoSheet, type SheetMode } from '../components/TodoSheets';
import { TodoFormSheet } from '../components/TodoFormSheet';
import { CheckIcon, PlayIcon, PlusIcon, RepeatIcon } from '../components/icons';

type Range = 'today' | 'week' | 'all';

const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All' },
];

export function BoardPage() {
  const { state, dispatch } = useStore();
  const [range, setRange] = useState<Range>('week');
  const [goalFilter, setGoalFilter] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ todoId: string; mode: SheetMode } | null>(null);
  const [form, setForm] = useState<{ todo?: Todo; status: TodoStatus } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TodoStatus | null>(null);

  const today = todayKey();
  const week = weekOf(today);
  const [start, end] = range === 'today' ? [today, today] : range === 'week' ? [week[0], week[6]] : ['', '9999-12-31'];

  const goalsById = new Map(state.goals.map((g) => [g.id, g]));
  const goalIndex = new Map(state.goals.map((g, i) => [g.id, i]));

  // In range, plus unfinished overdue todos so nothing slips off the board.
  const visible = state.todos.filter(
    (t) =>
      goalsById.has(t.goalId) &&
      (!goalFilter || t.goalId === goalFilter) &&
      ((t.date >= start && t.date <= end) || (!t.done && t.date < start)),
  );

  const columnTodos = (status: TodoStatus) =>
    visible
      .filter((t) => statusOf(t) === status)
      .sort((a, b) =>
        status === 'done'
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date) || goalIndex.get(a.goalId)! - goalIndex.get(b.goalId)! || a.order - b.order,
      );

  const drop = (status: TodoStatus, id: string | null) => {
    if (id) dispatch({ type: 'todo/setStatus', id, status });
    setDragId(null);
    setOverCol(null);
  };

  const sheetTodo = sheet && state.todos.find((t) => t.id === sheet.todoId);
  const sheetGoal = sheetTodo && goalsById.get(sheetTodo.goalId);

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">Board</h1>
        <span className="muted">
          {range === 'week' && `${formatLong(week[0])} – ${formatLong(week[6])}`}
          {range === 'today' && formatLong(today)}
        </span>
      </header>

      <div className="board-filters">
        <div className="segmented">
          {RANGES.map((r) => (
            <button key={r.id} className={range === r.id ? 'active' : ''} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="goal-filter">
          <button className={`filter-chip ${goalFilter === null ? 'active' : ''}`} onClick={() => setGoalFilter(null)}>
            All categories
          </button>
          {state.goals.filter((g) => !g.archived || g.id === goalFilter).map((g) => (
            <button
              key={g.id}
              className={`filter-chip ${goalFilter === g.id ? 'active' : ''}`}
              style={goalFilter === g.id ? { background: g.color, color: '#fff' } : { color: g.color }}
              onClick={() => setGoalFilter(goalFilter === g.id ? null : g.id)}
            >
              {g.title}
            </button>
          ))}
        </div>
      </div>

      <div className="board">
        {STATUSES.map((col) => {
          const cards = columnTodos(col.id);
          return (
            <section
              key={col.id}
              className={`column ${overCol === col.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.id) setOverCol(col.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col.id, e.dataTransfer.getData('text/plain') || dragId);
              }}
            >
              <div className="column-head">
                <span className={`status-dot ${col.id}`} />
                <span className="column-title">{col.label}</span>
                <span className="column-count">{cards.length}</span>
                <button
                  className="icon-btn column-add"
                  onClick={() => setForm({ status: col.id })}
                  aria-label={`Add to ${col.label}`}
                >
                  <PlusIcon size={16} />
                </button>
              </div>

              <div className="column-cards">
                {cards.map((t) => (
                  <Card
                    key={t.id}
                    todo={t}
                    goal={goalsById.get(t.goalId)!}
                    overdue={!t.done && t.date < today}
                    dragging={dragId === t.id}
                    onOpen={() => setSheet({ todoId: t.id, mode: 'actions' })}
                    onAdvance={(status) => dispatch({ type: 'todo/setStatus', id: t.id, status })}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                  />
                ))}
                {cards.length === 0 && <div className="column-empty">Drop todos here</div>}
              </div>
            </section>
          );
        })}
      </div>

      {sheet && sheetTodo && sheetGoal && (
        <TodoSheet
          todo={sheetTodo}
          goal={sheetGoal}
          mode={sheet.mode}
          setMode={(mode) => setSheet({ ...sheet, mode })}
          onEdit={() => setForm({ todo: sheetTodo, status: statusOf(sheetTodo) })}
          onClose={() => setSheet(null)}
        />
      )}
      {form && (
        <TodoFormSheet
          todo={form.todo}
          status={form.status}
          defaultDate={today}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

type CardProps = {
  todo: Todo;
  goal: Goal;
  overdue: boolean;
  dragging: boolean;
  onOpen: () => void;
  onAdvance: (status: TodoStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
};

function Card({ todo, goal, overdue, dragging, onOpen, onAdvance, onDragStart, onDragEnd }: CardProps) {
  const status = statusOf(todo);
  const next = status === 'todo' ? 'doing' : status === 'doing' ? 'done' : null;

  return (
    <div
      className={`kcard ${status} ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', todo.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <span className="kcard-bar" style={{ background: goal.color }} />
      <div className="kcard-body">
        <div className="kcard-title">
          {todo.title}
          {todo.repeat && (
            <span className="todo-badge">
              <RepeatIcon size={11} strokeWidth={2.5} />
            </span>
          )}
        </div>
        <div className="kcard-meta">
          <span style={{ color: goal.color }}>{goal.title}</span>
          <span className={overdue ? 'overdue' : ''}>
            {overdue ? `Overdue · ${relativeLabel(todo.date)}` : relativeLabel(todo.date)}
            {todo.time && ` · ${formatHM(todo.time)}`}
          </span>
          {todo.gcal && <span className="gcal-badge">Google</span>}
        </div>
      </div>
      {next && (
        <button
          className="kcard-next"
          onClick={(e) => {
            e.stopPropagation();
            onAdvance(next);
          }}
          aria-label={next === 'doing' ? 'Start' : 'Mark done'}
          title={next === 'doing' ? 'Start' : 'Mark done'}
        >
          {next === 'doing' ? <PlayIcon size={14} /> : <CheckIcon size={14} strokeWidth={3} />}
        </button>
      )}
    </div>
  );
}
