import { useState } from 'react';
import type { Goal } from '../types';
import { GOAL_COLORS, useStore } from '../store';
import { BottomSheet } from '../components/BottomSheet';
import { CheckIcon, ChevronRight, PlusIcon } from '../components/icons';

export function GoalsPage() {
  const { state } = useStore();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  const countFor = (goalId: string) => state.todos.filter((t) => t.goalId === goalId).length;

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">Goals</h1>
        <button className="icon-btn" onClick={() => setEditing('new')} aria-label="Add goal">
          <PlusIcon size={22} />
        </button>
      </header>

      <ul className="goal-manage-list">
        {state.goals.map((g) => (
          <li key={g.id}>
            <button className="goal-manage-row" onClick={() => setEditing(g)}>
              <span className="goal-chip static" style={{ color: g.color }}>
                <span className="goal-chip-title">{g.title}</span>
              </span>
              <span className="muted">{countFor(g.id)} todos</span>
              <ChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button className="add-goal-btn" onClick={() => setEditing('new')}>
        <PlusIcon size={16} /> New goal
      </button>

      {editing && <GoalEditor goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GoalEditor({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [color, setColor] = useState(goal?.color ?? GOAL_COLORS[state.goals.length % GOAL_COLORS.length]);

  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (goal) dispatch({ type: 'goal/update', id: goal.id, patch: { title: t, color } });
    else dispatch({ type: 'goal/add', title: t, color });
    onClose();
  };

  const remove = () => {
    if (!goal) return;
    if (confirm(`Delete "${goal.title}" and all of its todos?`)) {
      dispatch({ type: 'goal/delete', id: goal.id });
      onClose();
    }
  };

  return (
    <BottomSheet title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <div className="goal-form">
        <input
          className="text-input"
          autoFocus
          placeholder="Goal name"
          value={title}
          maxLength={40}
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
        <div className="sheet-buttons">
          {goal && <button className="btn danger" onClick={remove}>Delete</button>}
          <button className="btn primary" disabled={!title.trim()} onClick={save}>Save</button>
        </div>
      </div>
    </BottomSheet>
  );
}
