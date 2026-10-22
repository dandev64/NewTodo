import type { Goal, Todo } from '../types';
import { useStore } from '../store';
import { CheckIcon, MoreIcon, PlusIcon, RepeatIcon } from './icons';
import { TodoInput } from './TodoInput';

type Props = {
  goal: Goal;
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
  goal, date, todos, adding, editingId, onStartAdd, onStopAdd, onStopEdit, onOpenActions,
}: Props) {
  const { dispatch } = useStore();

  return (
    <div className="goal">
      <button className="goal-chip" onClick={onStartAdd} style={{ color: goal.color }}>
        <span className="goal-chip-title">{goal.title}</span>
        <span className="goal-chip-plus" style={{ background: goal.color }}>
          <PlusIcon size={10} strokeWidth={4} />
        </span>
      </button>

      <ul className="todo-list">
        {todos.map((todo) =>
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
            <li key={todo.id} className={`todo-row ${todo.done ? 'done' : ''}`}>
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
                {todo.title}
                {todo.repeat && (
                  <span className="todo-badge" title="Repeats">
                    <RepeatIcon size={11} strokeWidth={2.5} />
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
