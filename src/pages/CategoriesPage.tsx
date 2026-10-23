import { useState } from 'react';
import type { Goal } from '../types';
import { useStore } from '../store';
import { CategoryEditorSheet } from '../components/CategoryEditorSheet';
import { ChevronDown, ChevronRight, ChevronUp, PlusIcon } from '../components/icons';

export function CategoriesPage() {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  const active = state.goals.filter((g) => !g.archived);
  const ended = state.goals.filter((g) => g.archived);
  const countFor = (goalId: string) => state.todos.filter((t) => t.goalId === goalId).length;

  const row = (g: Goal, i: number, list: Goal[]) => (
    <li key={g.id} className="goal-manage-item">
      <button className="goal-manage-row" onClick={() => setEditing(g)}>
        <span className="goal-chip static" style={{ color: g.color }}>
          <span className="goal-chip-title">{g.title}</span>
        </span>
        <span className="muted">
          {countFor(g.id)} {countFor(g.id) === 1 ? 'todo' : 'todos'}
        </span>
        <ChevronRight size={16} />
      </button>
      {!g.archived && (
        <span className="reorder">
          <button
            className="icon-btn"
            disabled={i === 0}
            onClick={() => dispatch({ type: 'goal/move', id: g.id, dir: -1 })}
            aria-label={`Move ${g.title} up`}
          >
            <ChevronUp size={16} />
          </button>
          <button
            className="icon-btn"
            disabled={i === list.length - 1}
            onClick={() => dispatch({ type: 'goal/move', id: g.id, dir: 1 })}
            aria-label={`Move ${g.title} down`}
          >
            <ChevronDown size={16} />
          </button>
        </span>
      )}
    </li>
  );

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">Categories</h1>
        <button className="icon-btn" onClick={() => setEditing('new')} aria-label="Add category">
          <PlusIcon size={22} />
        </button>
      </header>

      {active.length === 0 && <p className="hint page-hint">No categories yet. Add one to start adding todos.</p>}
      <ul className="goal-manage-list">{active.map((g, i) => row(g, i, active))}</ul>
      <button className="add-goal-btn" onClick={() => setEditing('new')}>
        <PlusIcon size={16} /> New category
      </button>

      {ended.length > 0 && (
        <>
          <h2 className="section-title">Ended</h2>
          <ul className="goal-manage-list ended">{ended.map((g, i) => row(g, i, ended))}</ul>
        </>
      )}

      {editing && <CategoryEditorSheet goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
