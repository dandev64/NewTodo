import { useEffect, type ReactNode } from 'react';

type Props = {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

let openSheets = 0;

export function BottomSheet({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Stop the page behind the sheet from scrolling (iOS otherwise scrolls it on drag).
  useEffect(() => {
    openSheets++;
    document.documentElement.classList.add('sheet-open');
    return () => {
      if (--openSheets === 0) document.documentElement.classList.remove('sheet-open');
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
