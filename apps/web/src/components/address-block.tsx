import { MapPin, ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const comparable = (address: string) => address.normalize('NFC').trim().replace(/\s+/g, ' ');

/**
 * `legal` is the address printed on the certificate (Theo sổ), `current` the two-tier address in
 * daily use (Hiện nay). They often differ after the 2025 reform, so both show until they match.
 */
export function AddressBlock({ legal, current }: { legal: string | null; current: string | null }) {
  const t = useTranslations('components.address');
  const lines =
    legal !== null && current !== null && comparable(legal) === comparable(current)
      ? [{ key: 'same', label: t('same'), text: current, muted: false }]
      : [
          ...(current === null ? [] : [{ key: 'current', label: t('current'), text: current, muted: false }]),
          ...(legal === null ? [] : [{ key: 'legal', label: t('legal'), text: legal, muted: true }]),
        ];

  if (lines.length === 0) return <p className="text-body text-text-muted">{t('none')}</p>;

  return (
    <dl className="flex flex-col gap-3">
      {lines.map((line) => {
        const Icon = line.key === 'current' ? MapPin : ScrollText;
        return (
          <div key={line.key} data-line={line.key} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-icon-md shrink-0 text-text-secondary" strokeWidth={1.8} aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <dt className="text-caption text-text-muted">{line.label}</dt>
              <dd className={cn('break-words', line.muted ? 'text-body-sm text-text-secondary' : 'text-body text-text')}>{line.text}</dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
