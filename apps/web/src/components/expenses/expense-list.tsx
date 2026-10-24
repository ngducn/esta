import { EXPENSE_CATEGORIES } from '@esta/core/expenses';
import { formatDate, formatVnd } from '@esta/core/format';
import { FileText } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ExpenseRow } from '@/server/expenses/load';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { ExpenseRowButton } from './expense-row-button';

export async function ExpenseList({ rows, canEdit }: { rows: readonly ExpenseRow[]; canEdit: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('expenses'), getLocale()]);
  return (
    <ul data-testid="expense-list" className="flex flex-col">
      {rows.map((row) => {
        const category = t(EXPENSE_CATEGORIES[row.category].labelKey);
        const amount = formatVnd(row.amountVnd, locale);
        const date = formatDate(row.paidOn, locale);
        const body = (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span data-testid="expense-category" className="text-body font-medium text-ink">
                {category}
              </span>
              {row.vendor === null ? null : (
                <span data-testid="expense-vendor-name" className="text-small break-words text-ink-2">
                  {row.vendor.name}
                </span>
              )}
              <span data-testid="expense-date" className="text-small text-ink-muted figures">
                {date}
              </span>
            </span>
            <span data-testid="expense-amount" className="shrink-0 text-right text-body font-medium text-ink figures">
              {amount}
            </span>
          </>
        );
        return (
          <li
            key={row.id}
            data-testid="expense-row"
            data-expense-id={row.id}
            className="flex flex-col border-b border-rule last:border-b-0 sm:flex-row sm:items-center sm:gap-2"
          >
            {canEdit ? (
              <ExpenseRowButton expense={row} label={t('editRow', { category, amount, date })}>
                {body}
              </ExpenseRowButton>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-3 py-3">{body}</div>
            )}
            {row.documentId === null ? null : (
              <Link
                href={`/documents/${row.documentId}`}
                data-testid="expense-receipt-link"
                aria-label={t('receiptOf', { category, date })}
                className={cn(buttonVariants({ variant: 'quiet' }), '-mt-2 mb-1 shrink-0 self-start px-0 sm:my-0 sm:self-center sm:px-2')}
              >
                <FileText aria-hidden="true" />
                {t('receipt')}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
