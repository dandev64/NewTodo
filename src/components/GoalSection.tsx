import { useRef } from 'react';
import type { Goal, Todo } from '../types';
import { useStore } from '../store';
import { formatHM } from '../lib/date';
import { CalendarIcon, CheckIcon, GripIcon, MoreIcon, PlusIcon, RepeatIcon } from './icons';
import { TodoInput } from './TodoInput';

export type DragCallbacks = {
  dragIdx: number | null;
  overGoalId: string | null;
  overIdx: number | null;
  onGripDown: (e: React.PointerEvent, todoId: string, goalId: string, idx: number) => void;
};

type Props = {
  goal: Goal;
  ended?: boolean;
  date: string;
  todos: Todo[];
  adding: boolean;
  editingId: string | null;
  onStartAdd: () => void;
  onStopAdd: () => void;
  onStopEdit: () => void;
  onOpenActions: (todo: Todo) => void;
  drag: DragCallbacks;
  dragSourceGoalId: string | null;
  registerRef: (goalId: string, el: HTMLUListElement | null) => void;
};

export function GoalSection({
  goal, ended, date, todos, adding, editingId, onStartAdd, onStopAdd, onStopEdit, onOpenActions,
  drag, dragSourceGoalId, registerRef,
}: Props) {
  const { dispatch } = useStore();
  const listRef = useRef<HTMLUListElement | null>(null);

  const setListRef = (el: HTMLUListElement | null) => {
    listRef.current = el;
    registerRef(goal.id, el);
  };

  const isDragSource = dragSourceGoalId === goal.id;
  const isDragTarget = drag.overGoalId === goal.id && !isDragSource;

  return (
    <div className={`goal ${isDragTarget ? 'drag-target' : ''}`}>
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

      <ul className="todo-list" ref={setListRef}>
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
              className={`todo-row ${todo.done ? 'done' : ''} ${isDragSource && drag.dragIdx === idx ? 'sort-dragging' : ''} ${isDragSource && drag.overIdx === idx && drag.dragIdx !== null && drag.dragIdx !== idx ? 'sort-over' : ''} ${isDragTarget && drag.overIdx === idx ? 'sort-over' : ''}`}
            >
              <span
                className="grip"
                onPointerDown={(e) => drag.onGripDown(e, todo.id, goal.id, idx)}
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
