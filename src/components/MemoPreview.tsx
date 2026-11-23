import { useState } from 'react';

/** One-line memo shown beside a todo title; tap to expand/collapse the full text. */
export function MemoPreview({ memo }: { memo: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`todo-memo ${open ? 'open' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      title={open ? undefined : memo}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      {memo}
    </span>
  );
}
