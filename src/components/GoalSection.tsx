import { useRef, useState } from 'react';
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
  const gripActive = useRef(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const commitReorder = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const ids = todos.map((t) => t.id);
      const [moved] = ids.splice(dragIdx, 1);
      ids.splice(overIdx, 0, moved);
      dispatch({ type: 'todo/reorder', goalId: goal.id, date, ids });
    }
    setDragIdx(null);
    setOverIdx(null);
  };

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

      <ul className="todo-list">
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
              draggable
              onDragStart={(e) => {
                if (!gripActive.current) { e.preventDefault(); return; }
                e.dataTransfer.effectAllowed = 'move';
                setDragIdx(idx);
              }}
              onDragEnd={() => { gripActive.current = false; commitReorder(); }}
              onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null) setOverIdx(idx); }}
              onDrop={(e) => { e.preventDefault(); commitReorder(); }}
            >
              <span className="grip" onPointerDown={() => { gripActive.current = true; }}>
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
