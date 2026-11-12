import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { formatLong, todayKey } from '../lib/date';
import { Calendar } from '../components/Calendar';
import { GoalSection, type DragCallbacks } from '../components/GoalSection';
import { TodoSheet, type SheetMode } from '../components/TodoSheets';
import { TodoFormSheet } from '../components/TodoFormSheet';
import { CategoryEditorSheet } from '../components/CategoryEditorSheet';
import { PlusIcon } from '../components/icons';
import { GoogleDaySection, useMonthEvents } from '../components/GoogleEvents';
import type { GEvent } from '../lib/google';

export function HomePage() {
  const { state, dispatch } = useStore();
  const [selected, setSelected] = useState(todayKey);
  const [addingGoalId, setAddingGoalId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ todoId: string; mode: SheetMode } | null>(null);
  const [importing, setImporting] = useState<GEvent | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  const google = useMonthEvents(selected.slice(0, 7));
  const eventDays = useMemo(() => new Set(google.events.flatMap((e) => e.days)), [google.events]);

  const dayTodos = state.todos.filter((t) => t.date === selected).sort((a, b) => a.order - b.order);
  const visibleGoals = state.goals.filter((g) => !g.archived || dayTodos.some((t) => t.goalId === g.id));
  const sheetTodo = sheet && state.todos.find((t) => t.id === sheet.todoId);
  const sheetGoal = sheetTodo && state.goals.find((g) => g.id === sheetTodo.goalId);

  const selectDate = (key: string) => {
    setSelected(key);
    setAddingGoalId(null);
    setEditingId(null);
  };

  // ── Drag-to-reorder (lifted from GoalSection for cross-category support) ──

  const goalListRefs = useRef<Map<string, HTMLUListElement>>(new Map());
  const registerRef = useCallback((goalId: string, el: HTMLUListElement | null) => {
    if (el) goalListRefs.current.set(goalId, el);
    else goalListRefs.current.delete(goalId);
  }, []);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overGoalId, setOverGoalId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [dragSourceGoalId, setDragSourceGoalId] = useState<string | null>(null);

  const dragRef = useRef<{
    todoId: string;
    sourceGoalId: string;
    idx: number;
    startY: number;
    clone: HTMLElement | null;
  } | null>(null);
  const onDocMove = useRef<((e: PointerEvent) => void) | null>(null);
  const onDocUp = useRef<((e: PointerEvent) => void) | null>(null);

  const cleanupListeners = useCallback(() => {
    if (onDocMove.current) document.removeEventListener('pointermove', onDocMove.current);
    if (onDocUp.current) {
      document.removeEventListener('pointerup', onDocUp.current);
      document.removeEventListener('pointercancel', onDocUp.current);
    }
    onDocMove.current = null;
    onDocUp.current = null;
  }, []);

  const handleGripDown = useCallback((e: React.PointerEvent, todoId: string, goalId: string, idx: number) => {
    const li = (e.target as HTMLElement).closest('li');
    if (!li) return;
    e.preventDefault();

    const rect = li.getBoundingClientRect();
    const clone = li.cloneNode(true) as HTMLElement;
    clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:9999;opacity:0.9;box-shadow:0 8px 24px rgba(0,0,0,0.18);pointer-events:none;transition:none;`;
    document.body.appendChild(clone);

    dragRef.current = { todoId, sourceGoalId: goalId, idx, startY: e.clientY, clone };
    setDragIdx(idx);
    setDragSourceGoalId(goalId);
    setOverGoalId(goalId);
    setOverIdx(idx);

    onDocMove.current = (me: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !d.clone) return;
      me.preventDefault();
      d.clone.style.transform = `translateY(${me.clientY - d.startY}px)`;

      // Hit-test which goal section the pointer is over
      let hitGoalId: string | null = null;
      let hitIdx = 0;
      for (const [gid, ul] of goalListRefs.current) {
        const r = ul.getBoundingClientRect();
        if (me.clientY >= r.top - 20 && me.clientY <= r.bottom + 20) {
          hitGoalId = gid;
          const rows = ul.querySelectorAll<HTMLElement>('li.todo-row');
          hitIdx = rows.length; // default: append at end
          for (let i = 0; i < rows.length; i++) {
            const rr = rows[i].getBoundingClientRect();
            if (me.clientY < rr.top + rr.height / 2) {
              hitIdx = i;
              break;
            }
          }
          break;
        }
      }

      if (hitGoalId) {
        setOverGoalId(hitGoalId);
        setOverIdx(hitIdx);
      }
    };

    onDocUp.current = () => {
      const d = dragRef.current;
      if (!d) return;
      if (d.clone) d.clone.remove();
      dragRef.current = null;
      cleanupListeners();

      setDragIdx(null);
      setDragSourceGoalId(null);
      setOverGoalId((targetGoalId) => {
        setOverIdx((targetIdx) => {
          if (targetGoalId && targetIdx !== null) {
            if (targetGoalId !== d.sourceGoalId) {
              // Cross-category: move the todo to the new category
              const todo = state.todos.find((t) => t.id === d.todoId);
              if (todo) {
                dispatch({ type: 'todo/update', id: d.todoId, patch: { title: todo.title, goalId: targetGoalId, date: todo.date } });
                // Reorder within the new category
                const targetTodos = state.todos
                  .filter((t) => t.goalId === targetGoalId && t.date === selected)
                  .sort((a, b) => a.order - b.order);
                const ids = targetTodos.map((t) => t.id);
                ids.splice(targetIdx, 0, d.todoId);
                dispatch({ type: 'todo/reorder', goalId: targetGoalId, date: selected, ids });
              }
            } else if (d.idx !== targetIdx) {
              // Same category: reorder
              const goalTodos = state.todos
                .filter((t) => t.goalId === d.sourceGoalId && t.date === selected)
                .sort((a, b) => a.order - b.order);
              const ids = goalTodos.map((t) => t.id);
              const [moved] = ids.splice(d.idx, 1);
              ids.splice(targetIdx, 0, moved);
              dispatch({ type: 'todo/reorder', goalId: d.sourceGoalId, date: selected, ids });
            }
          }
          return null;
        });
        return null;
      });
    };

    document.addEventListener('pointermove', onDocMove.current);
    document.addEventListener('pointerup', onDocUp.current);
    document.addEventListener('pointercancel', onDocUp.current);
  }, [state.todos, selected, dispatch, cleanupListeners]);

  useEffect(() => {
    return () => {
      cleanupListeners();
      if (dragRef.current?.clone) dragRef.current.clone.remove();
    };
  }, [cleanupListeners]);

  const dragCallbacks: DragCallbacks = { dragIdx, overGoalId, overIdx, onGripDown: handleGripDown };

  return (
    <div className="page home">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>TODO mate</span>
        </div>
      </header>

      <div className="home-left">
        <Calendar
          selected={selected}
          onSelect={selectDate}
          todos={state.todos}
          goals={state.goals}
          eventDays={eventDays}
        />
      </div>

      <div className="home-right">
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
          {visibleGoals.length === 0 ? (
            <div className="empty">
              <p>Create a category to start adding todos.</p>
              <button className="btn primary" onClick={() => setAddingCategory(true)}>Add a category</button>
            </div>
          ) : (
            visibleGoals.map((goal) => (
              <GoalSection
                key={goal.id}
                goal={goal}
                ended={!!goal.archived}
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
                drag={dragCallbacks}
                dragSourceGoalId={dragSourceGoalId}
                registerRef={registerRef}
              />
            ))
          )}
          {visibleGoals.length > 0 && (
            <button className="add-category-btn" onClick={() => setAddingCategory(true)}>
              <PlusIcon size={14} strokeWidth={2.5} /> Add category
            </button>
          )}
        </section>
      </div>
      {addingCategory && <CategoryEditorSheet goal={null} onClose={() => setAddingCategory(false)} />}

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
