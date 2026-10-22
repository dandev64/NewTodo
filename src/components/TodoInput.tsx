import { useEffect, useRef, useState } from 'react';

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
    ref.current?.focus();
  }, []);

  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  const commit = (stayOpen: boolean) => {
    const title = value.trim();
    if (title && title !== initial) onSubmit(title);
    if (title && stayOpen) setValue('');
    else close();
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
