import { useTranslations } from 'next-intl';
import type { LeaseChangeRefusal } from '@/server/actions/leases';
import { FormAlert } from '@/components/form-alert';

/** A refusal from amend, terminate or renew, beside the button that caused it. */
export function ChangeRefusal({ reason }: { reason: LeaseChangeRefusal | null }) {
  const t = useTranslations('leases');
  if (reason === null) return null;
  return <FormAlert message={t('changeRefusal', { reason })} data-testid="lease-change-refusal" data-reason={reason} />;
}
