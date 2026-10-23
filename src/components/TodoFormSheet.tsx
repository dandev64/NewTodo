import { useState } from 'react';
import type { Todo, TodoStatus } from '../types';
import { useStore } from '../store';
import { BottomSheet } from './BottomSheet';

type Props = {
  /** Edit this todo; omit to create a new one. */
  todo?: Todo;
  status?: TodoStatus;
  defaultDate: string;
  /** Prefill for a new todo, e.g. when importing a calendar event. */
  initial?: Partial<Pick<Todo, 'title' | 'source' | 'externalId' | 'time' | 'duration'>>;
  onClose: () => void;
};

export function TodoFormSheet({ todo, status = 'todo', defaultDate, initial, onClose }: Props) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState(todo?.title ?? initial?.title ?? '');
  const [goalId, setGoalId] = useState(todo?.goalId ?? state.goals[0]?.id ?? '');
  const [date, setDate] = useState(todo?.date ?? defaultDate);

  const valid = !!title.trim() && !!goalId && !!date;

  const save = () => {
    if (!valid) return;
    const patch = { title: title.trim(), goalId, date };
    if (todo) dispatch({ type: 'todo/update', id: todo.id, patch });
    else
      dispatch({
        type: 'todo/add',
        ...patch,
        status,
        source: initial?.source,
        externalId: initial?.externalId,
        time: initial?.time,
        duration: initial?.duration,
      });
    onClose();
  };

  return (
    <BottomSheet title={todo ? 'Edit todo' : 'New todo'} onClose={onClose}>
      {state.goals.length === 0 ? (
        <p className="hint">Create a goal first in the Goals tab.</p>
      ) : (
        <div className="goal-form">
          <input
            className="text-input"
            autoFocus
            placeholder="Enter a todo"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
          />
          <div className="goal-picker">
            {state.goals.map((g) => (
              <button
                key={g.id}
                className={`goal-chip static ${g.id === goalId ? 'picked' : ''}`}
                style={{ color: g.color, borderColor: g.id === goalId ? g.color : undefined }}
                onClick={() => setGoalId(g.id)}
              >
                <span className="goal-chip-title">{g.title}</span>
              </button>
            ))}
          </div>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="sheet-buttons">
            <button className="btn primary" disabled={!valid} onClick={save}>Save</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
