import { formatShareBp, type OwnershipStatus } from '@esta/core/properties/ownership';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusShape } from '@/components/status-shape';

/** Shown from the saved rows, so it stays until someone saves shares that reach exactly 100% (PRP-3). */
export async function OwnershipWarning({ status }: { status: OwnershipStatus }) {
  if (status.state === 'complete') return null;
  const [t, locale] = await Promise.all([getTranslations('propertyOwners'), getLocale()]);
  const total = formatShareBp(status.totalBp, locale);
  return (
    <p role="status" data-testid="ownership-warning" data-state={status.state} className="flex items-start gap-2 rounded-md bg-due-fill px-3 py-2.5 text-body text-due">
      <StatusShape status="due" className="mt-0.5" />
      <span className="figures font-medium">{status.state === 'under' ? t('warningUnder', { total }) : t('warningOver', { total })}</span>
    </p>
  );
}
