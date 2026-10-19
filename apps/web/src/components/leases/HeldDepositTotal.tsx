import { formatVnd } from '@esta/core/format';
import { getLocale, getTranslations } from 'next-intl/server';
import { loadHeldDepositTotal } from '@/server/leases/deposits';

/** LSE-9 on Tài sản: every deposit the household holds for its tenants, a sum it owes back. Nothing while none is held. */
export async function HeldDepositTotal({ householdId }: { householdId: string }) {
  const [held, t, locale] = await Promise.all([loadHeldDepositTotal(householdId), getTranslations('deposits'), getLocale()]);
  if (held === 0) return null;
  return (
    <p data-testid="deposit-held-total" className="text-small text-ink-2 figures">
      {t('heldTotal', { amount: formatVnd(held, locale) })}
    </p>
  );
}
