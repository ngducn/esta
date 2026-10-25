import type { LegalStatus, UseMode } from '@esta/core/properties';
import { Briefcase, CirclePause, Hammer, House, KeyRound, Users, type LucideIcon } from 'lucide-react';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-shape';
import { cn } from '@/lib/utils';

const useIcons = {
  rental: KeyRound,
  owner_occupied: House,
  family_use: Users,
  own_business: Briefcase,
  held: CirclePause,
  under_renovation: Hammer,
} as const satisfies Record<UseMode, LucideIcon>;

/** Legal status borrows the status shapes: a certificate is settled, a pending or paper-only one needs attention. */
const legalMarks = {
  certified: 'paid',
  certificate_pending: 'due',
  paper_only: 'due',
  shared_certificate: 'vacant',
  in_dispute: 'overdue',
  unknown: 'draft',
} as const satisfies Record<LegalStatus, MarkStatus>;

const pill = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-medium';

export function UsePill({ useMode, label }: { useMode: UseMode; label: string }) {
  const Icon = useIcons[useMode];
  return (
    <span data-use={useMode} className={cn(pill, 'border border-rule bg-surface-2 text-ink-2')}>
      <Icon className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

export function LegalPill({ legalStatus, label }: { legalStatus: LegalStatus; label: string }) {
  const mark = legalMarks[legalStatus];
  return (
    <span data-legal={legalStatus} className={cn(pill, statusMarks[mark].pill)}>
      <StatusShape status={mark} className="size-4" />
      {label}
    </span>
  );
}

/** The `propertyStatus` mark: shape, word and the status token, as `Trống từ 01/08`. */
export function StatusPill({ status, label }: { status: MarkStatus; label: string }) {
  return (
    <span data-status={status} className={cn(pill, statusMarks[status].pill)}>
      <StatusShape status={status} className="size-4" />
      {label}
    </span>
  );
}
