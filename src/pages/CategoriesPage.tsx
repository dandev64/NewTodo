import { useRef, useState } from 'react';
import type { Goal } from '../types';
import { useStore } from '../store';
import { CategoryEditorSheet } from '../components/CategoryEditorSheet';
import { ChevronDown, ChevronRight, ChevronUp, GripIcon, PlusIcon } from '../components/icons';

export function CategoriesPage() {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const gripActive = useRef(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const active = state.goals.filter((g) => !g.archived);
  const ended = state.goals.filter((g) => g.archived);
  const countFor = (goalId: string) => state.todos.filter((t) => t.goalId === goalId).length;

  const commitReorder = () => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const ids = active.map((g) => g.id);
      const [moved] = ids.splice(dragIdx, 1);
      ids.splice(overIdx, 0, moved);
      dispatch({ type: 'goal/reorder', ids: [...ids, ...ended.map((g) => g.id)] });
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const row = (g: Goal, i: number, list: Goal[], isDraggable: boolean) => (
    <li
      key={g.id}
      className={`goal-manage-item ${isDraggable && dragIdx === i ? 'sort-dragging' : ''} ${isDraggable && overIdx === i && dragIdx !== null && dragIdx !== i ? 'sort-over' : ''}`}
      draggable={isDraggable}
      onDragStart={(e) => {
        if (!isDraggable || !gripActive.current) { e.preventDefault(); return; }
        e.dataTransfer.effectAllowed = 'move';
        setDragIdx(i);
      }}
      onDragEnd={() => { gripActive.current = false; commitReorder(); }}
      onDragOver={(e) => { e.preventDefault(); if (isDraggable && dragIdx !== null) setOverIdx(i); }}
      onDrop={(e) => { e.preventDefault(); commitReorder(); }}
    >
      {isDraggable && (
        <span className="grip" onPointerDown={() => { gripActive.current = true; }}>
          <GripIcon size={16} />
        </span>
      )}
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
      <ul className="goal-manage-list">{active.map((g, i) => row(g, i, active, true))}</ul>
      <button className="add-goal-btn" onClick={() => setEditing('new')}>
        <PlusIcon size={16} /> New category
      </button>

      {ended.length > 0 && (
        <>
          <h2 className="section-title">Ended</h2>
          <ul className="goal-manage-list ended">{ended.map((g, i) => row(g, i, ended, false))}</ul>
        </>
      )}

      {editing && <CategoryEditorSheet goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
