import { Check } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { QrAction } from '@/components/invoices/QrAction';
import { ReceivingAccountButton } from '@/components/invoices/ReceivingAccountButton';
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
        <h2 id="accounts-heading" className="text-h3">
          {t('accounts')}
        </h2>
        <p className="text-ink-muted">{t('accountsIntro')}</p>
        {admin ? null : <p className="text-ink-muted">{t('accountsReadOnly')}</p>}
      </div>
      {accounts.length === 0 ? (
        <Card>
          <p data-testid="accounts-empty" className="text-body text-ink-2">
            {t(admin ? 'accountsEmpty' : 'accountsEmptyReadOnly')}
          </p>
        </Card>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="flex flex-col divide-y divide-rule">
            {accounts.map((account) => {
              const headingId = `account-${account.id}`;
              return (
                <li key={account.id} data-testid="receiving-account" data-default={account.isDefault} className="flex flex-col gap-3 p-5 sm:p-6">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 id={headingId} className="text-lead font-bold break-words">
                        {account.bankName}
                      </h3>
                      {account.isDefault ? (
                        <span data-testid="account-default" className="inline-flex items-center gap-1 rounded-full border border-rule bg-surface-2 px-2.5 py-0.5 text-small font-semibold text-ink">
                          <Check className="size-4" strokeWidth={2.2} aria-hidden="true" />
                          {t('accountDefault')}
                        </span>
                      ) : null}
                    </div>
                    <p data-testid="account-number" className="figures text-body font-semibold break-all text-ink">
                      {account.accountNo}
                    </p>
                    <p data-testid="account-holder" className="text-small break-words text-ink-2">
                      {account.accountName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <QrAction
                      label={t('accountSample')}
                      title={t('accountSampleTitle', { bank: account.bankName })}
                      description={t('accountSampleBody')}
                      invoiceHref={null}
                      qr={sampleQr(account, t('accountSampleNumber'), locale)}
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
      {sheet === null ? null : (
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
