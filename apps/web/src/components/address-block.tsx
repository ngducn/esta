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

  if (lines.length === 0) return <p className="text-body text-ink-muted">{t('none')}</p>;

  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
      {lines.map((line) => (
        <div key={line.key} data-line={line.key} className="grid gap-x-4 sm:col-span-2 sm:grid-cols-subgrid">
          <dt className="text-small text-ink-muted sm:pt-0.5">{line.label}</dt>
          <dd className={cn('break-words', line.muted ? 'text-small text-ink-muted' : 'text-body text-ink')}>{line.text}</dd>
        </div>
      ))}
    </dl>
  );
}
