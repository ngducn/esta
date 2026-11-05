import { Check } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { QrAction } from '@/components/invoices/QrAction';
import { ReceivingAccountButton } from '@/components/invoices/ReceivingAccountButton';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { Card } from '@/components/ui/card';
import type { Member } from '@/server/member';
import { loadAccountSheet } from '@/server/invoices/labels';
import { loadQrLabels, loadReceivingAccounts, sampleQr } from '@/server/invoices/qr';
import { AccountActions } from './account-actions';

/** PLT-1 `Tài khoản nhận tiền`: every account with its sample QR, so Mẹ can scan it before tenants rely on it. */
export async function ReceivingAccounts({ member }: { member: Member }) {
  const admin = member.role === 'admin';
  const [t, locale, accounts, qrLabels, sheet] = await Promise.all([
    getTranslations('settings'),
    getLocale(),
    loadReceivingAccounts(member.household.id),
    loadQrLabels(),
    admin ? loadAccountSheet() : null,
  ]);
  const actionLabels = sheet && {
    makeDefault: t('accountMakeDefault'),
    remove: t('accountRemove'),
    removeBody: t('accountRemoveBody'),
    removeConfirm: t('accountRemoveConfirm'),
    keep: t('accountKeep'),
    refusals: sheet.labels.refusals,
  };

  return (
    <section aria-labelledby="accounts-heading" data-testid="receiving-accounts" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="accounts-heading" className="text-title-3">
          {t('accounts')}
        </h2>
        <p className="text-text-muted">{t('accountsIntro')}</p>
        {admin ? null : <p className="text-text-muted">{t('accountsReadOnly')}</p>}
      </div>
      {accounts.length === 0 ? (
        <div data-testid="accounts-empty">
          <RegistryEmptyState
            surface="settingsAccounts"
            ctx={{ canWrite: admin }}
            cta={(label) =>
              sheet === null ? null : <ReceivingAccountButton label={label} banks={sheet.banks} labels={sheet.labels} mode={{ kind: 'add', becomesDefault: true }} />
            }
          />
        </div>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="flex flex-col divide-y divide-border">
            {accounts.map((account) => {
              const headingId = `account-${account.id}`;
              return (
                <li key={account.id} data-testid="receiving-account" data-default={account.isDefault} className="flex flex-col gap-3 p-5 sm:p-6">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 id={headingId} className="text-headline font-semibold break-words">
                        {account.bankName}
                      </h3>
                      {account.isDefault ? (
                        <span data-testid="account-default" className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-body-sm font-medium text-text">
                          <Check className="size-4" strokeWidth={2.2} aria-hidden="true" />
                          {t('accountDefault')}
                        </span>
                      ) : null}
                    </div>
                    <p data-testid="account-number" className="num text-body font-medium break-all text-text">
                      {account.accountNo}
                    </p>
                    <p data-testid="account-holder" className="text-body-sm break-words text-text-secondary">
                      {account.accountName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <QrAction
                      label={t('accountSample')}
                      title={t('accountSampleTitle', { bank: account.bankName })}
                      description={t('accountSampleBody')}
                      invoiceHref={null}
                      qr={sampleQr(account, locale)}
                      labels={qrLabels}
                    />
                    {sheet === null ? null : (
                      <ReceivingAccountButton label={t('accountEdit')} banks={sheet.banks} labels={sheet.labels} mode={{ kind: 'edit', account }} describedBy={headingId} />
                    )}
                    {actionLabels === null || account.isDefault ? null : (
                      <AccountActions
                        id={account.id}
                        removeTitle={t('accountRemoveTitle', { bank: account.bankName, number: account.accountNo })}
                        describedBy={headingId}
                        labels={actionLabels}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {sheet === null || accounts.length === 0 ? null : (
        <ReceivingAccountButton
          label={t('accountAdd')}
          banks={sheet.banks}
          labels={sheet.labels}
          mode={{ kind: 'add', becomesDefault: accounts.every((account) => !account.isDefault) }}
        />
      )}
    </section>
  );
}
