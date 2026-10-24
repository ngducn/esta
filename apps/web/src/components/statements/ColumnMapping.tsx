'use client';

import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { cellText, HEADER_SCAN_ROWS, type ColumnPreset, type StatementGrid, type StatementRow } from '@esta/core/matching';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FieldMessage } from '@/components/field-message';
import { FormSelect } from '@/components/properties/address-picker';
import { cn } from '@/lib/utils';
import { guessPicks, type Picks, type PicksReason } from '@/lib/statements/picks';

export type MappingProblem = PicksReason | 'no_rows';

const PROBLEMS = {
  incomplete: 'mappingIncomplete',
  no_column: 'mappingIncomplete',
  same_column: 'mappingSameColumn',
  no_rows: 'mappingNoRows',
} as const satisfies Record<MappingProblem, string>;

type Role = 'date' | 'description' | 'bankRef' | 'amount' | 'credit' | 'debit';

const LABELS = {
  date: 'columnDate',
  description: 'columnDescription',
  bankRef: 'columnBankRef',
  amount: 'columnAmount',
  credit: 'columnCredit',
  debit: 'columnDebit',
} as const satisfies Record<Role, string>;

const TEST_IDS = { date: 'date', description: 'description', bankRef: 'bank-ref', amount: 'amount', credit: 'credit', debit: 'debit' } as const satisfies Record<Role, string>;

const INTROS = { new: 'mappingIntro', mismatch: 'mappingMismatch', change: 'mappingChange' } as const satisfies Record<Props['intro'], string>;

const clip = (text: string) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);

type Props = {
  readonly grid: StatementGrid;
  readonly picks: Picks;
  readonly onPicks: (picks: Picks) => void;
  readonly preset: ColumnPreset | undefined;
  /** Why the mapping is open: a header Esta has never seen, one that differs from the account's saved columns, or a change of saved columns. */
  readonly intro: 'new' | 'mismatch' | 'change';
  readonly sample: readonly StatementRow[];
  readonly problem: MappingProblem | null;
  /** What the columns read in the whole file, under the sample. */
  readonly counts: ReactNode;
  readonly disabled: boolean;
};

/**
 * LSE-8 column mapping (P3-21): for a file whose header Esta does not know, a person picks the header row under the
 * bank's account lines, the date, description and optional bank reference columns, and the amount as one signed
 * column or as money in and money out, and sees the first lines decoded before confirming with `Xem trước`.
 */
export function ColumnMapping({ grid, picks, onPicks, preset, intro, sample, problem, counts, disabled }: Props) {
  const t = useTranslations('statements');
  const locale = useLocale() as Locale;
  const cells = grid[picks.headerRow] ?? [];
  const columns = cells.map((cell, index) => {
    const label = cellText(cell);
    return { value: String(index), label: label === '' ? t('columnBlank', { column: index + 1 }) : t('columnOption', { column: index + 1, label: clip(label) }) };
  });
  const rows = grid.slice(0, HEADER_SCAN_ROWS).map((row, index) => {
    const text = row.map(cellText).filter((cell) => cell !== '');
    return { value: String(index), label: text.length === 0 ? t('headerRowBlank') : clip(text.join(' · ')) };
  });
  const select = (role: Role) => {
    const value = picks[role];
    const optional = role === 'bankRef';
    return (
      <FormSelect
        key={role}
        label={t(LABELS[role])}
        value={value === null ? '' : String(value)}
        {...(optional ? { options: [{ value: '', label: t('columnNone') }, ...columns] } : { options: columns, placeholder: t('columnChoose') })}
        onChange={(next) => onPicks({ ...picks, [role]: next === '' ? null : Number(next) })}
        testId={`mapping-${TEST_IDS[role]}`}
        disabled={disabled}
      />
    );
  };
  const kind = (split: boolean, label: string) => (
    <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-field bg-surface px-3 py-2.5 text-body font-medium text-ink transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted has-checked:border-ink has-checked:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <input type="radio" name="mapping-amount-kind" checked={picks.split === split} disabled={disabled} onChange={() => onPicks({ ...picks, split })} className="size-5 shrink-0 accent-accent" />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );

  return (
    <section aria-labelledby="mapping-title" data-testid="column-mapping" className="flex flex-col gap-5 border-t border-rule pt-5">
      <div className="flex flex-col gap-1">
        <h2 id="mapping-title" className="text-lead font-semibold text-ink">
          {t('mappingTitle')}
        </h2>
        <p data-testid="mapping-intro" className="max-w-prose text-body text-ink-2">
          {t(INTROS[intro])}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <FormSelect
          label={t('headerRow')}
          value={String(picks.headerRow)}
          options={rows}
          onChange={(next) => onPicks(guessPicks(grid, Number(next), preset))}
          testId="mapping-header-row"
          disabled={disabled}
        />
        <p className="text-small text-ink-muted">{t('headerRowHint')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{(['date', 'description', 'bankRef'] as const).map(select)}</div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body font-medium text-ink">{t('amountLegend')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {kind(false, t('amountSigned'))}
          {kind(true, t('amountSplit'))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{(picks.split ? (['credit', 'debit'] as const) : (['amount'] as const)).map(select)}</div>
      </fieldset>
      <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
        <h3 className="text-body font-medium text-ink">{t('sampleTitle')}</h3>
        {sample.length === 0 ? null : (
          <ol data-testid="mapping-sample" className="flex flex-col">
            {sample.map((row) => (
              <li key={row.index} data-testid="mapping-sample-row" className="flex flex-col gap-0.5 border-b border-rule py-2.5 first:pt-0 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span data-testid="mapping-sample-date" className="figures min-w-0 text-small text-ink-muted">
                    {formatDate(row.date, locale)}
                  </span>
                  <span data-testid="mapping-sample-amount" className={cn('figures shrink-0 text-body font-medium whitespace-nowrap', row.amount < 0 ? 'text-ink-muted' : 'text-ink')}>
                    {formatVnd(row.amount, locale)}
                  </span>
                </div>
                <span className="text-body break-words text-ink">{row.description}</span>
              </li>
            ))}
          </ol>
        )}
        <FieldMessage id="mapping-problem" error={problem === null ? null : t(PROBLEMS[problem])}>
          {problem === null ? counts : null}
        </FieldMessage>
      </div>
    </section>
  );
}
