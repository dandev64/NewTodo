import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { formatLong, todayKey } from '../lib/date';
import { Calendar } from '../components/Calendar';
import { GoalSection } from '../components/GoalSection';
import { TodoSheet, type SheetMode } from '../components/TodoSheets';
import { TodoFormSheet } from '../components/TodoFormSheet';
import { GoogleDaySection, useMonthEvents } from '../components/GoogleEvents';
import type { GEvent } from '../lib/google';

type Props = { onGoToGoals: () => void };

export function HomePage({ onGoToGoals }: Props) {
  const { state } = useStore();
  const [selected, setSelected] = useState(todayKey);
  const [addingGoalId, setAddingGoalId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ todoId: string; mode: SheetMode } | null>(null);
  const [importing, setImporting] = useState<GEvent | null>(null);

  const google = useMonthEvents(selected.slice(0, 7));
  const eventDays = useMemo(() => new Set(google.events.flatMap((e) => e.days)), [google.events]);

  const dayTodos = state.todos.filter((t) => t.date === selected).sort((a, b) => a.order - b.order);
  const sheetTodo = sheet && state.todos.find((t) => t.id === sheet.todoId);
  const sheetGoal = sheetTodo && state.goals.find((g) => g.id === sheetTodo.goalId);

  const selectDate = (key: string) => {
    setSelected(key);
    setAddingGoalId(null);
    setEditingId(null);
  };

  return (
    <div className="page home">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>TODO mate</span>
        </div>
      </header>

      <Calendar
        selected={selected}
        onSelect={selectDate}
        todos={state.todos}
        goals={state.goals}
        eventDays={eventDays}
      />

      <div className="day-label">{formatLong(selected)}</div>

      <GoogleDaySection
        date={selected}
        events={google.events}
        loading={google.loading}
        error={google.error}
        todos={state.todos}
        onRefresh={google.refresh}
        onImport={setImporting}
      />

      <section className="goals">
        {state.goals.length === 0 ? (
          <div className="empty">
            <p>Create a goal to start adding todos.</p>
            <button className="btn primary" onClick={onGoToGoals}>Add a goal</button>
          </div>
        ) : (
          state.goals.map((goal) => (
            <GoalSection
              key={goal.id}
              goal={goal}
              date={selected}
              todos={dayTodos.filter((t) => t.goalId === goal.id)}
              adding={addingGoalId === goal.id}
              editingId={editingId}
              onStartAdd={() => {
                setEditingId(null);
                setAddingGoalId(goal.id);
              }}
              onStopAdd={() => setAddingGoalId((cur) => (cur === goal.id ? null : cur))}
              onStopEdit={() => setEditingId(null)}
              onOpenActions={(todo) => setSheet({ todoId: todo.id, mode: 'actions' })}
            />
          ))
        )}
      </section>

      {sheet && sheetTodo && sheetGoal && (
        <TodoSheet
          todo={sheetTodo}
          goal={sheetGoal}
          mode={sheet.mode}
          setMode={(mode) => setSheet({ ...sheet, mode })}
          onEdit={() => {
            setAddingGoalId(null);
            setEditingId(sheetTodo.id);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {importing && (
        <TodoFormSheet
          defaultDate={selected}
          initial={{
            title: importing.title,
            source: 'google',
            externalId: importing.id,
            time: importing.time,
            duration: importing.duration,
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}
