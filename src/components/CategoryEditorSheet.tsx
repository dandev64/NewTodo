import { useState } from 'react';
import type { Goal } from '../types';
import { GOAL_COLORS, useStore } from '../store';
import { BottomSheet } from './BottomSheet';
import { CheckIcon } from './icons';

/** Create (goal = null) or edit a category. Categories are stored as `Goal`s. */
export function CategoryEditorSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [color, setColor] = useState(() => {
    if (goal) return goal.color;
    // Suggest a color no category uses yet.
    const used = new Set(state.goals.map((g) => g.color));
    return GOAL_COLORS.find((c) => !used.has(c)) ?? GOAL_COLORS[state.goals.length % GOAL_COLORS.length];
  });

  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (goal) dispatch({ type: 'goal/update', id: goal.id, patch: { title: t, color } });
    else dispatch({ type: 'goal/add', title: t, color });
    onClose();
  };

  const remove = () => {
    if (!goal) return;
    if (confirm(`Delete "${goal.title}" and all of its todos? To keep its todos, end the category instead.`)) {
      dispatch({ type: 'goal/delete', id: goal.id });
      onClose();
    }
  };

  const toggleEnded = () => {
    if (!goal) return;
    dispatch({ type: 'goal/update', id: goal.id, patch: { archived: !goal.archived } });
    onClose();
  };

  return (
    <BottomSheet title={goal ? 'Edit category' : 'New category'} onClose={onClose}>
      <div className="goal-form">
        <input
          className="text-input"
          autoFocus
          placeholder="Category name"
          value={title}
          maxLength={40}
          enterKeyHint="done"
          autoCapitalize="words"
          autoComplete="off"
          style={{ color }}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
        />
        <div className="color-grid">
          {GOAL_COLORS.map((c) => (
            <button
              key={c}
              className="color-swatch"
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            >
              {c === color && <CheckIcon size={14} strokeWidth={3.5} />}
            </button>
          ))}
        </div>
        {goal && (
          <p className="hint">
            {goal.archived
              ? 'This category has ended. Restore it to add todos to it again.'
              : 'Ending a category hides it from Home but keeps its past todos.'}
          </p>
        )}
        <div className="sheet-buttons">
          {goal && <button className="btn danger" onClick={remove}>Delete</button>}
          {goal && (
            <button className="btn secondary" onClick={toggleEnded}>
              {goal.archived ? 'Restore' : 'End category'}
            </button>
          )}
          <button className="btn primary" disabled={!title.trim()} onClick={save}>Save</button>
        </div>
      </div>
    </BottomSheet>
  );
}
