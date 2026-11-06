import { idSchema } from '@esta/ops';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { OfflineNotice } from '@/components/collections/offline-notice';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { ImportPreview } from '@/components/statements/ImportPreview';
import { loadReceivingAccounts } from '@/server/invoices/qr';
import { requireMember } from '@/server/member';
import { statementIslandIntl } from '@/server/properties/island-messages';
import { loadStatementImport } from '@/server/statements/load';

type Params = Promise<{ id: string }>;
type Search = Promise<{ known?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('statements');
  return { title: t('previewTitle') };
}

/** LSE-8 preview of one import: its lines, what posts on `Ghi sổ`, and the suggestions left to confirm. */
export default async function StatementPreviewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, search, member, t] = await Promise.all([params, searchParams, requireMember(), getTranslations('statements')]);
  if (!idSchema.safeParse(id).success || !member.can('import')) notFound();
  const [view, accounts, intl] = await Promise.all([loadStatementImport(member.household.id, id), loadReceivingAccounts(member.household.id), statementIslandIntl()]);
  if (view === null) notFound();
  const account = accounts.find((candidate) => candidate.id === view.accountId);
  const known = typeof search.known === 'string' && /^[1-9][0-9]{0,4}$/.test(search.known) ? Number(search.known) : 0;
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/collections/import" label={t('title')} />
      <div className="flex flex-col gap-1">
        <h1 className="text-title-2 break-words lg:text-title-1">{t('previewTitle')}</h1>
        <p data-testid="statement-file-line" className="text-body break-words text-text-secondary">
          {t('fileLine', { file: view.fileName, account: account === undefined ? '' : t('accountOption', { bank: account.bankName, number: account.accountNo }) })}
        </p>
      </div>
      {known === 0 ? null : (
        <p data-testid="statement-known" className="max-w-prose rounded-md border border-border bg-bg-subtle px-4 py-3 text-body text-text">
          {t('known', { count: known })}
        </p>
      )}
      <OfflineNotice message={t('offline')} />
      <PropertyIntl locale={intl.locale} messages={intl.messages}>
        <ImportPreview importId={view.id} committed={view.committed} lines={view.lines} refused={view.refused} />
      </PropertyIntl>
    </div>
  );
}
