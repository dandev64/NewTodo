import type { ReactNode } from 'react';

type Props = { size?: number; strokeWidth?: number };

function Svg({ size = 20, strokeWidth = 2, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: Props) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const CheckIcon = (p: Props) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const ChevronLeft = (p: Props) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const ChevronRight = (p: Props) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const ChevronDown = (p: Props) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const ChevronUp = (p: Props) => <Svg {...p}><path d="M6 15l6-6 6 6" /></Svg>;
export const MoreIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </Svg>
);
export const RepeatIcon = (p: Props) => (
  <Svg {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></Svg>
);
export const EditIcon = (p: Props) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
);
export const TrashIcon = (p: Props) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></Svg>
);
export const ArrowRightIcon = (p: Props) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const CopyIcon = (p: Props) => (
  <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>
);
export const CalendarIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>
);
export const HomeIcon = (p: Props) => (
  <Svg {...p}><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" /></Svg>
);
export const FlagIcon = (p: Props) => (
  <Svg {...p}><path d="M4 22V4" /><path d="M4 4h13l-2 4 2 4H4" /></Svg>
);
export const BoardIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18M15 3v12" /></Svg>
);
export const PlayIcon = (p: Props) => <Svg {...p}><path d="M8 5.5v13l10-6.5z" /></Svg>;
export const TagIcon = (p: Props) => (
  <Svg {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></Svg>
);
export const ClockIcon = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const UserIcon = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
);
