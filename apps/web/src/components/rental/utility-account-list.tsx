import type { Unit, UtilityAccount } from '@esta/core/schemas/units';
import { Droplet, Plug, Wifi, Zap, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { deleteAccount, restoreAccount } from '@/app/(app)/properties/[id]/rental/actions';
import { ItemActions } from '@/components/item-actions';

const kindIcons = { electricity: Zap, water: Droplet, internet: Wifi, other: Plug } as const satisfies Record<UtilityAccount['kind'], LucideIcon>;

type Group = { readonly id: string; readonly title: string; readonly accounts: readonly UtilityAccount[] };

/** Property-level accounts first, then each unit's in the unit order; an account whose unit is gone counts as property level. */
function groupAccounts(accounts: readonly UtilityAccount[], units: readonly Unit[], wholeTitle: string): Group[] {
  const unitIds = new Set(units.map((unit) => unit.id));
  const groups: Group[] = [
    { id: 'property', title: wholeTitle, accounts: accounts.filter((account) => account.unit_id === null || !unitIds.has(account.unit_id)) },
    ...units.map((unit) => ({ id: unit.id, title: unit.label, accounts: accounts.filter((account) => account.unit_id === unit.id) })),
  ];
  return groups.filter((group) => group.accounts.length > 0);
}

export async function UtilityAccountList({ propertyId, accounts, units, canEdit }: { propertyId: string; accounts: readonly UtilityAccount[]; units: readonly Unit[]; canEdit: boolean }) {
  const t = await getTranslations('propertyRental');
  return (
    <div data-testid="account-groups" className="flex flex-col gap-5">
      {groupAccounts(accounts, units, t('wholeProperty')).map((group) => (
        <section key={group.id} aria-labelledby={`accounts-${group.id}`} data-testid="account-group" className="flex flex-col gap-2">
          <h3 id={`accounts-${group.id}`} className="text-body font-medium text-ink-2">
            {group.title}
          </h3>
          <ul className="flex flex-col overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
            {group.accounts.map((account) => {
              const Icon = kindIcons[account.kind];
              const name = t('accountName', { kind: account.kind });
              return (
                <li key={account.id} data-testid="account-row" data-kind={account.kind} className="flex flex-col gap-3 border-b border-rule p-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
                      <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-body font-medium text-ink">
                        {t('utilityKind', { kind: account.kind })}
                        {account.provider === null ? null : <span className="font-normal text-ink-2">{` · ${account.provider}`}</span>}
                      </p>
                      {account.customer_code === null ? (
                        <p className="text-small text-ink-muted">{t('noCode')}</p>
                      ) : (
                        <p className="text-small text-ink-muted">
                          {t('customerCode')} <span data-testid="customer-code" className="figures inline-block font-medium break-all text-ink select-all">{account.customer_code}</span>
                        </p>
                      )}
                      {account.holder_name === null ? null : (
                        <p className="text-small break-words text-ink-muted">
                          {t('holder')} <span className="text-ink-2">{account.holder_name}</span>
                        </p>
                      )}
                      {account.note === null ? null : <p className="text-small break-words text-ink-2">{account.note}</p>}
                    </div>
                  </div>
                  {canEdit ? (
                    <ItemActions
                      compact
                      editHref={`/properties/${propertyId}/rental/accounts/${account.id}`}
                      remove={deleteAccount.bind(null, propertyId, account.id)}
                      restore={restoreAccount}
                      labels={{
                        edit: t('edit'),
                        editLabel: t('editLabel', { label: name }),
                        delete: t('delete'),
                        deleteLabel: t('deleteLabel', { label: name }),
                        deleting: t('deleting'),
                        deleted: t('deleted', { label: name }),
                        deleteFailed: t('deleteFailed'),
                        restoreFailed: t('restoreFailed'),
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
