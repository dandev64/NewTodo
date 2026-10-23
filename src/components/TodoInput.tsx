import { useEffect, useRef, useState } from 'react';
import { revealAboveKeyboard } from '../lib/viewport';

type Props = {
  color: string;
  initial?: string;
  /** Keep the input open after submitting so several todos can be typed in a row. */
  keepOpen?: boolean;
  onSubmit: (title: string) => void;
  onClose: () => void;
};

export function TodoInput({ color, initial = '', keepOpen, onSubmit, onClose }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const closed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    revealAboveKeyboard(el);
  }, []);

  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  const commit = (stayOpen: boolean) => {
    const title = value.trim();
    if (title && title !== initial) onSubmit(title);
    if (title && stayOpen) {
      setValue('');
      // The new todo pushes this input down; keep it above the keyboard.
      if (ref.current) revealAboveKeyboard(ref.current);
    } else close();
  };

  return (
    <div className="todo-row editing">
      <span className="check" />
      <input
        ref={ref}
        className="todo-input"
        style={{ borderBottomColor: color }}
        value={value}
        placeholder="Enter a todo"
        maxLength={200}
        enterKeyHint={keepOpen ? 'next' : 'done'}
        autoCapitalize="sentences"
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') commit(!!keepOpen);
          if (e.key === 'Escape') close();
        }}
        onBlur={() => commit(false)}
      />
    </div>
  );
}
