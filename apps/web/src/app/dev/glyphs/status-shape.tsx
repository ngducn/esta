import type { Status } from '@/design/tokens';

const PATHS: Record<Status, { d: string; filled: boolean }> = {
  paid: { d: 'M4 12.5l5 5L20 6.5', filled: false },
  due: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3.5 2', filled: false },
  overdue: { d: 'M12 2.5L21.5 12L12 21.5L2.5 12z', filled: true },
  vacant: { d: 'M4.5 4.5h15v15h-15z', filled: false },
};

export function StatusShape({ status }: { status: Status }) {
  const { d, filled } = PATHS[status];
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      style={{ color: `var(--${status})` }}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-shape={status}
    >
      <path d={d} />
    </svg>
  );
}
