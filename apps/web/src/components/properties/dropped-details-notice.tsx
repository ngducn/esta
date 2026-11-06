import { droppedDetailKeys, type KindFieldTexts, type PropertyKind } from '@esta/core/properties/form';
import { useTranslations } from 'next-intl';
import { StatusShape } from '@/components/status-shape';

/** Under the kind's fields: names what saving would delete when the chosen kind has no field for it (#397). */
export function DroppedDetailsNotice({ kind, texts }: { kind: PropertyKind; texts: KindFieldTexts }) {
  const t = useTranslations('propertyForm');
  const dropped = droppedDetailKeys(kind, texts);
  if (dropped.length === 0) return null;
  const details = dropped.map((key) => t('detailShort', { key })).join(', ');
  return (
    <p role="status" data-testid="dropped-details" className="flex items-start gap-2 text-body text-text">
      <StatusShape status="due" className="mt-0.5 size-icon-sm" />
      <span className="min-w-0 wrap-anywhere">{t('droppedDetails', { details })}</span>
    </p>
  );
}
