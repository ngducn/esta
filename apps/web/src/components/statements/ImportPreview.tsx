'use client';

import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FieldMessage } from '@/components/field-message';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { commitStatement } from '@/server/actions/statements';
import { LINE_STATUSES, type BillLabel, type LineStatus, type RefusedLine, type StatementLine } from '@/lib/statements/lines';

/** Shape, word, then color: a match waits to post, a suggestion waits for a person, a posted line is settled. */
const LINE_MARKS = { memo_match: 'upcoming', suggested: 'due', unmatched: 'draft', ignored: 'ended', posted: 'paid' } as const satisfies Record<LineStatus, MarkStatus>;
const KNOWN_REFUSALS = new Set(['fractional', 'credit_and_debit', 'after_today']);

type Filter = LineStatus | 'all';

function useBillText() {
  const t = useTranslations('statements');
  return (bill: BillLabel) => t('bill', { place: bill.wholeUnit ? bill.propertyName : t('place', { unit: bill.unitLabel, property: bill.propertyName }), number: bill.number });
}

/** What a line goes to, or why it goes nowhere. */
function LineTarget({ line }: { line: StatementLine }) {
  const t = useTranslations('statements');
  const locale = useLocale();
  const billText = useBillText();
  const [bill] = line.bills;
  let text: string;
  if (line.status === 'ignored') text = t(line.reason === 'debit' ? 'reasonDebit' : 'reasonDuplicate');
  else if (line.reason === 'repeat') text = t('reasonRepeat');
  else if (line.reason === 'paid' || line.reason === 'void') text = t(line.reason === 'paid' ? 'reasonPaid' : 'reasonVoid', { number: bill?.number ?? '' });
  else if (line.status !== 'unmatched' && bill !== undefined) text = billText(bill);
  else if (line.bills.length > 1) text = t('reasonAmbiguous', { bills: new Intl.ListFormat(locale, { type: 'disjunction' }).format(line.bills.map(billText)) });
  else text = t('reasonNone');
  return (
    <span data-testid="statement-target" className="min-w-0 text-small break-words text-ink-2">
      {text}
    </span>
  );
}

function LineRow({ line, reserve, checked, onCheck, disabled }: { line: StatementLine; reserve: boolean; checked: boolean; onCheck: (on: boolean) => void; disabled: boolean }) {
  const t = useTranslations('statements');
  const locale = useLocale() as Locale;
  const mark = LINE_MARKS[line.status];
  return (
    <li data-testid="statement-line" data-line={line.index} data-status={line.status} className={cn('flex gap-2 border-b border-rule px-4 py-4 last:border-b-0 sm:gap-3 sm:px-6', reserve && 'sm:pl-3')}>
      {line.status === 'suggested' ? (
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onCheck} aria-label={t('confirmLine', { line: line.index })} className="-my-2.5 -ml-2.5" />
      ) : reserve ? (
        <span aria-hidden="true" className="-ml-2.5 hidden size-touch shrink-0 sm:block" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="figures min-w-0 text-small text-ink-muted">
            {formatDate(line.date, locale)} · {t('lineMeta', { line: line.index })}
            {line.bankRef === '' ? null : <span className="max-sm:hidden"> · {t('bankRef', { ref: line.bankRef })}</span>}
          </p>
          <p data-testid="statement-amount" className={cn('figures shrink-0 text-body font-semibold whitespace-nowrap', line.amount < 0 ? 'text-ink-muted' : 'text-ink')}>
            {formatVnd(line.amount, locale)}
          </p>
        </div>
        <p className="text-body break-words text-ink">{line.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span data-testid="statement-status" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold', statusMarks[mark].pill)}>
            <StatusShape status={mark} className="size-4" />
            {t('status', { status: line.status })}
          </span>
          <LineTarget line={line} />
        </div>
      </div>
    </li>
  );
}

/**
 * LSE-8 preview: every line in file order, its match and what posting will do. `Ghi sổ` posts the memo matches and the
 * ticked suggestions together; after it, the suggestions left can still be confirmed with the same button.
 */
export function ImportPreview({ importId, committed, lines, refused }: { importId: string; committed: boolean; lines: readonly StatementLine[]; refused: readonly RefusedLine[] }) {
  const t = useTranslations('statements');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const suggestions = lines.filter((line) => line.status === 'suggested');
  const posting = lines.filter((line) => line.status === 'memo_match' || chosen.has(line.id));
  const total = vnd(posting.reduce((sum, line) => sum + line.amount, 0));
  const shown = filter === 'all' ? lines : lines.filter((line) => line.status === filter);
  const toggle = (ids: readonly string[], on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const submit = () => {
    setError(null);
    setResult(null);
    startSaving(async () => {
      const outcome = await commitStatement({ import_id: importId, confirmed_row_ids: [...chosen] }).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!outcome.ok) {
        setError(t('errorFailed'));
        return;
      }
      const { posted, skipped } = outcome.value;
      setResult(skipped === 0 ? t('posted', { count: posted }) : `${t('posted', { count: posted })} ${t('skipped', { count: skipped })}`);
      setChosen(new Set());
      router.refresh();
    });
  };

  const pick = (value: Filter, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      data-testid={`statement-filter-${value}`}
      onClick={() => setFilter(value)}
      className={cn(
        'figures min-h-touch rounded-full border px-4 text-small font-semibold transition-colors duration-(--duration-fast) ease-standard',
        filter === value ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:border-field',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={t('filter')} className="flex flex-wrap gap-2">
        {pick('all', t('filterAll', { count: lines.length }))}
        {LINE_STATUSES.map((status) => pick(status, t('filterStatus', { status, count: lines.filter((line) => line.status === status).length })))}
      </div>

      <section aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        {committed && posting.length === 0 ? (
          <p data-testid="statement-committed" className="text-body font-semibold text-ink">
            {t('committedNote')}
          </p>
        ) : (
          <p data-testid="statement-summary" className="figures text-body text-ink">
            {posting.length === 0 ? t('summaryNone') : t('summary', { count: posting.length, amount: formatVnd(total, locale) })}
          </p>
        )}
        {result === null ? null : (
          <p data-testid="statement-result" className="flex items-start gap-2 text-body text-ink">
            <StatusShape status="paid" className="mt-0.5 size-5" />
            {result}
          </p>
        )}
        {committed && suggestions.length === 0 ? null : (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <Button type="button" onClick={submit} disabled={saving || posting.length === 0} data-testid="statement-commit">
              {saving ? t('committing') : committed ? t('confirmSelected', { count: chosen.size }) : t('commit', { count: posting.length })}
            </Button>
            <FieldMessage id="statement-commit-error" error={error} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-rule bg-surface shadow-card">
        {suggestions.length === 0 ? null : (
          <label className="flex items-center gap-2 border-b border-rule px-4 py-2 text-body font-semibold text-ink sm:px-3">
            <Checkbox
              data-testid="statement-select-all"
              checked={chosen.size === suggestions.length}
              indeterminate={chosen.size > 0 && chosen.size < suggestions.length}
              disabled={saving}
              onCheckedChange={(on) => toggle(suggestions.map((line) => line.id), on)}
            />
            {t('selectAll', { count: suggestions.length })}
          </label>
        )}
        {shown.length === 0 ? (
          <p className="px-4 py-5 text-body text-ink-muted sm:px-6">{t('empty')}</p>
        ) : (
          <ol>
            {shown.map((line) => (
              <LineRow key={line.id} line={line} reserve={suggestions.length > 0} checked={chosen.has(line.id)} disabled={saving} onCheck={(on) => toggle([line.id], on)} />
            ))}
          </ol>
        )}
      </section>

      {refused.length === 0 ? null : (
        <section data-testid="statement-refused" className="flex flex-col gap-2 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
          <h2 className="text-lead font-bold text-ink">{t('refusedTitle', { count: refused.length })}</h2>
          <ul className="flex flex-col gap-1">
            {refused.map((line) => (
              <li key={`${line.index}-${line.field}`} className="flex items-start gap-2 text-body text-ink">
                <StatusShape status="overdue" className="mt-1 size-4" />
                {t('refusedLine', { line: line.index, reason: KNOWN_REFUSALS.has(line.reason) ? t('refusedReason', { reason: line.reason }) : t('refusedField', { field: line.field }) })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
