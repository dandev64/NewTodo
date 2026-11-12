import { useCallback, useEffect, useRef, useState } from 'react';
import type { Goal, Todo } from '../types';
import { useStore } from '../store';
import { formatHM } from '../lib/date';
import { CalendarIcon, CheckIcon, GripIcon, MoreIcon, PlusIcon, RepeatIcon } from './icons';
import { TodoInput } from './TodoInput';

type Props = {
  goal: Goal;
  /** Ended category: shown for its existing todos, but no new todos can be added. */
  ended?: boolean;
  date: string;
  todos: Todo[];
  adding: boolean;
  editingId: string | null;
  onStartAdd: () => void;
  onStopAdd: () => void;
  onStopEdit: () => void;
  onOpenActions: (todo: Todo) => void;
};

export function GoalSection({
  goal, ended, date, todos, adding, editingId, onStartAdd, onStopAdd, onStopEdit, onOpenActions,
}: Props) {
  const { dispatch } = useStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<{
    idx: number;
    startY: number;
    clone: HTMLElement | null;
    pointerId: number;
  } | null>(null);

  const commitReorder = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx !== toIdx) {
      const ids = todos.map((t) => t.id);
      const [moved] = ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, moved);
      dispatch({ type: 'todo/reorder', goalId: goal.id, date, ids });
    }
  }, [todos, dispatch, goal.id, date]);

  const handleGripDown = useCallback((e: React.PointerEvent, idx: number) => {
    const li = (e.target as HTMLElement).closest('li');
    if (!li || !listRef.current) return;

    e.preventDefault();
    li.setPointerCapture(e.pointerId);

    const rect = li.getBoundingClientRect();
    const clone = li.cloneNode(true) as HTMLElement;
    clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:9999;opacity:0.9;box-shadow:0 8px 24px rgba(0,0,0,0.18);pointer-events:none;transition:none;`;
    document.body.appendChild(clone);

    dragRef.current = { idx, startY: e.clientY, clone, pointerId: e.pointerId };
    setDragIdx(idx);
    setOverIdx(idx);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.clone || !listRef.current) return;

    const dy = e.clientY - d.startY;
    d.clone.style.transform = `translateY(${dy}px)`;

    const items = listRef.current.querySelectorAll<HTMLElement>('li.todo-row');
    let target = d.idx;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) target = i;
    }
    setOverIdx(target);
  }, []);

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    if (d.clone) d.clone.remove();

    const from = d.idx;
    dragRef.current = null;

    setDragIdx((prev) => {
      setOverIdx((over) => {
        if (prev !== null && over !== null) commitReorder(from, over);
        return null;
      });
      return null;
    });
  }, [commitReorder]);

  useEffect(() => {
    return () => {
      if (dragRef.current?.clone) dragRef.current.clone.remove();
    };
  }, []);

  return (
    <div className="goal">
      {ended ? (
        <span className="goal-chip static ended" style={{ color: goal.color }}>
          <span className="goal-chip-title">{goal.title}</span>
          <span className="ended-badge">Ended</span>
        </span>
      ) : (
        <button className="goal-chip" onClick={onStartAdd} style={{ color: goal.color }}>
          <span className="goal-chip-title">{goal.title}</span>
          <span className="goal-chip-plus" style={{ background: goal.color }}>
            <PlusIcon size={10} strokeWidth={4} />
          </span>
        </button>
      )}

      <ul className="todo-list" ref={listRef}>
        {todos.map((todo, idx) =>
          todo.id === editingId ? (
            <li key={todo.id}>
              <TodoInput
                color={goal.color}
                initial={todo.title}
                onSubmit={(title) => dispatch({ type: 'todo/rename', id: todo.id, title })}
                onClose={onStopEdit}
              />
            </li>
          ) : (
            <li
              key={todo.id}
              className={`todo-row ${todo.done ? 'done' : ''} ${dragIdx === idx ? 'sort-dragging' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'sort-over' : ''}`}
            >
              <span
                className="grip"
                onPointerDown={(e) => handleGripDown(e, idx)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <GripIcon size={16} />
              </span>
              <button
                className="check"
                style={todo.done ? { background: goal.color } : undefined}
                onClick={() => dispatch({ type: 'todo/toggle', id: todo.id })}
                aria-label={todo.done ? 'Mark as not done' : 'Mark as done'}
              >
                {todo.done && <CheckIcon size={14} strokeWidth={3.5} />}
                {!todo.done && todo.inProgress && <span className="check-doing" style={{ background: goal.color }} />}
              </button>
              <span className="todo-title" onClick={() => onOpenActions(todo)}>
                {todo.time && <span className="todo-time">{formatHM(todo.time)}</span>}
                {todo.title}
                {todo.repeat && (
                  <span className="todo-badge" title="Repeats">
                    <RepeatIcon size={11} strokeWidth={2.5} />
                  </span>
                )}
                {todo.gcal && (
                  <span className="todo-badge gcal-badge" title="In Google Calendar">
                    <CalendarIcon size={11} strokeWidth={2.5} />
                  </span>
                )}
              </span>
              <button className="icon-btn more" onClick={() => onOpenActions(todo)} aria-label="More">
                <MoreIcon size={18} />
              </button>
            </li>
          ),
        )}
        {adding && (
          <li>
            <TodoInput
              key={date}
              color={goal.color}
              keepOpen
              onSubmit={(title) => dispatch({ type: 'todo/add', goalId: goal.id, date, title })}
              onClose={onStopAdd}
            />
          </li>
        )}
      </ul>
    </div>
  );
}
