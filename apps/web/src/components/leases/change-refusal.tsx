import { useTranslations } from 'next-intl';
import type { LeaseChangeRefusal } from '@/server/actions/leases';
import { StatusShape } from '@/components/status-mark';

/** A refusal from amend, terminate or renew, beside the button that caused it. */
export function ChangeRefusal({ reason }: { reason: LeaseChangeRefusal | null }) {
  const t = useTranslations('leases');
  if (reason === null) return null;
  return (
    <p role="alert" data-testid="lease-change-refusal" data-reason={reason} className="flex items-start gap-2 text-body text-overdue">
      <StatusShape status="overdue" className="mt-1 size-4" />
      <span>{t('changeRefusal', { reason })}</span>
    </p>
  );
}
