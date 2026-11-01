import { formatDate, formatVnd } from '@esta/core/format';
import { shownStatus } from '@esta/core/schemas/legal';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusShape, statusMarks } from '@/components/status-shape';
import { cn } from '@/lib/utils';
import type { LegalRow } from '@esta/ops';
import type { PartyOption } from '@/server/properties/legal';
import { LegalCard } from './legal-card';

const statusMark = { valid: 'paid', undated: 'draft', mortgaged: 'due', replaced: 'ended', lost: 'overdue' } as const;

export async function CertificateCard({
  propertyId,
  certificate,
  parties,
  canEdit,
}: {
  propertyId: string;
  certificate: LegalRow<'certificates'>;
  parties: ReadonlyMap<string, PartyOption>;
  canEdit: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations('propertyLegal'), getLocale()]);
  const holders = certificate.holder_party_ids.flatMap((id) => parties.get(id)?.fullName ?? []);
  const { mortgage } = certificate;
  const status = shownStatus(certificate);
  const mark = statusMark[status];
  const facts = [
    certificate.serial_no === null ? null : t('serial', { serial: certificate.serial_no }),
    certificate.book_entry_no === null ? null : t('bookEntry', { entry: certificate.book_entry_no }),
    certificate.issued_on === null ? null : t('issued', { date: formatDate(certificate.issued_on, locale) }),
    certificate.issued_by === null ? null : t('issuedBy', { issuer: certificate.issued_by }),
  ].filter((fact) => fact !== null);
  return (
    <LegalCard
      propertyId={propertyId}
      kind="certificates"
      itemId={certificate.id}
      name={certificate.serial_no ?? 'none'}
      canEdit={canEdit}
      title={t('form', { form: certificate.form })}
    >
      <p
        data-testid="certificate-status"
        data-status={status}
        className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-small font-medium', statusMarks[mark].pill)}
      >
        <StatusShape status={mark} className="size-4" />
        {t('status', { status })}
      </p>
      {mortgage === null ? null : (
        <div data-testid="certificate-mortgage" className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-3 py-2">
          <p className="text-body font-medium break-words text-ink">{t('mortgagedTo', { bank: parties.get(mortgage.bank_party_id)?.fullName ?? '' })}</p>
          <p className="figures text-lead text-ink">{formatVnd(mortgage.amount_vnd, locale)}</p>
          {mortgage.released_on === undefined ? null : (
            <p className="text-small text-ink-muted">{t('mortgageReleased', { date: formatDate(mortgage.released_on, locale) })}</p>
          )}
          {mortgage.released_on !== undefined || mortgage.registered_on === undefined ? null : (
            <p className="text-small text-ink-muted">{t('registeredOn', { date: formatDate(mortgage.registered_on, locale) })}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-small text-ink-muted">{t('holders')}</p>
        <p data-testid="certificate-holders" className="text-body break-words text-ink">
          {holders.length === 0 ? t('noHolders') : holders.join(', ')}
        </p>
      </div>
      {facts.length === 0 ? null : (
        <ul className="flex flex-col gap-0.5 text-small text-ink-2">
          {facts.map((fact) => (
            <li key={fact} className="break-words">
              {fact}
            </li>
          ))}
        </ul>
      )}
      {certificate.annotations.length === 0 ? null : (
        <p className="text-small text-ink-muted">{t('annotationCount', { count: certificate.annotations.length })}</p>
      )}
    </LegalCard>
  );
}
