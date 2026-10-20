import { Landmark } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { StatementUpload } from '@/components/statements/StatementUpload';
import { loadReceivingAccounts } from '@/server/invoices/qr';
import { requireMember } from '@/server/member';
import { statementIslandIntl } from '@/server/properties/island-messages';
import { loadColumnPresets } from '@/server/statements/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('statements');
  return { title: t('metaTitle') };
}

/**
 * LSE-8: an admin chooses the receiving account and a statement file; the browser reads it, under each account's saved
 * columns when Esta does not know its header (P3-21), and the preview opens.
 */
export default async function StatementImportPage() {
  const [member, t] = await Promise.all([requireMember(), getTranslations('statements')]);
  const heading = (
    <>
      <BackLink href="/collections" label={t('back')} />
      <h1 className="text-h2 break-words lg:text-h1">{t('title')}</h1>
    </>
  );
  if (member.role !== 'admin') {
    return (
      <div className="flex flex-col gap-5">
        {heading}
        <p data-testid="statement-admin-only" className="max-w-prose text-body text-ink-2">
          {t('adminOnly')}
        </p>
      </div>
    );
  }
  const [accounts, intl] = await Promise.all([loadReceivingAccounts(member.household.id), statementIslandIntl()]);
  const presets = await loadColumnPresets(
    member.household.id,
    accounts.map((account) => account.id),
  );
  return (
    <div className="flex flex-col gap-5">
      {heading}
      {accounts.length === 0 ? (
        <EmptyState title={t('noAccountTitle')} body={t('noAccountBody')} icon={Landmark} action={{ label: t('noAccountAction'), href: '/collections' }} />
      ) : (
        <PropertyIntl locale={intl.locale} messages={intl.messages}>
          <StatementUpload
            accounts={accounts.map((account) => ({ id: account.id, label: t('accountOption', { bank: account.bankName, number: account.accountNo }) }))}
            presets={presets}
          />
        </PropertyIntl>
      )}
    </div>
  );
}
