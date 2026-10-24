import { formatVnd, type Locale } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import {
  TAX_WORKED_EXAMPLES,
  runWorkedExample,
  selectTaxRule,
  taxRuleRowSchema,
  type TaxRule,
  type TaxRuleSelection,
  type WorkedExampleOwner,
} from '@esta/core/tax';
import { isDeepStrictEqual } from 'node:util';
import { getLocale, getTranslations } from 'next-intl/server';
import { taxNoteText } from '@/components/tax/note-text';
import { createSessionClient } from '@/server/supabase/server';

const EXAMPLE_YEAR = 2026;

type LoadedRules = { ok: true; rules: TaxRule[] } | { ok: false; reason: string };

async function loadRules(): Promise<LoadedRules> {
  const client = await createSessionClient();
  const { data, error } = await client.from('tax_rules').select('kind, effective_from, effective_to, params, source_citation, note');
  if (error) return { ok: false, reason: error.message };
  const parsed = taxRuleRowSchema.array().safeParse(data);
  return parsed.success ? { ok: true, rules: parsed.data } : { ok: false, reason: parsed.error.message };
}

function parseYear(text: string | undefined): number {
  return text !== undefined && /^\d{4}$/.test(text) ? Number(text) : EXAMPLE_YEAR;
}

export async function TaxSection({ taxYear }: { taxYear?: string | undefined }) {
  const [t, notes, locale, loaded] = await Promise.all([
    getTranslations('devTax'),
    getTranslations('taxNotes'),
    getLocale(),
    loadRules(),
  ]);
  const money = (amount: Vnd) => formatVnd(amount, locale as Locale);
  const year = parseYear(taxYear);
  const selected: TaxRuleSelection | null = loaded.ok ? selectTaxRule(loaded.rules, year) : null;
  const exampleRule = loaded.ok ? selectTaxRule(loaded.rules, EXAMPLE_YEAR) : null;

  const rows = TAX_WORKED_EXAMPLES.map((example) => {
    const actual = exampleRule?.kind === 'rule' ? runWorkedExample(example, exampleRule.rule) : [];
    return { example, actual, matches: isDeepStrictEqual(actual, example.expected) };
  });

  const figure = (owners: readonly WorkedExampleOwner[], expected: readonly WorkedExampleOwner[], pick: (owner: WorkedExampleOwner) => Vnd) =>
    expected.map((want, i) => {
      const got = owners[i];
      const shown = got === undefined ? '' : money(pick(got));
      return got !== undefined && pick(got) === pick(want) ? shown : `${shown} (${t('expected', { value: money(pick(want)) })})`;
    });

  return (
    <section aria-labelledby="tax-heading" data-section="tax" id="tax" className="flex flex-col gap-4">
      <h2 id="tax-heading" className="text-lead font-semibold">
        {t('title')}
      </h2>
      <p className="text-small text-ink-muted">{t('intro')}</p>

      <div data-testid="tax-rule" data-year={year} data-state={selected?.kind ?? 'unavailable'} className="flex flex-col gap-1 text-small">
        <h3 className="font-medium">{t('ruleFor', { year })}</h3>
        {!loaded.ok && <p>{t('ruleUnavailable', { reason: loaded.reason })}</p>}
        {selected?.kind === 'no_rule' && <p data-testid="tax-no-rule">{notes('noRule', { year })}</p>}
        {selected?.kind === 'rule' && (
          <>
            <p data-testid="tax-source">{notes('source', { citation: selected.rule.sourceCitation })}</p>
            {selected.rule.note !== null && <p data-testid="tax-rule-note">{taxNoteText('pit_effective_date', selected.rule, notes)}</p>}
            <p>{notes('estimateDisclaimer')}</p>
          </>
        )}
      </div>

      <table className="w-full text-left text-small max-sm:block">
        <thead className="max-sm:sr-only">
          <tr className="border-b">
            {[t('example'), t('inputs'), t('revenue'), t('thresholdTotal'), t('vat'), t('pit'), t('notes'), t('result')].map((label) => (
              <th key={label} scope="col" className="py-1 pr-4">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums max-sm:block">
          {rows.map(({ example, actual, matches }) => {
            const rule = exampleRule?.kind === 'rule' ? exampleRule.rule : null;
            const cells: [string, string, readonly string[]][] = [
              ['example', t('example'), [example.id]],
              ['inputs', t('inputs'), [t(example.id.toLowerCase() as 'e1')]],
              ['revenue', t('revenue'), figure(actual, example.expected, (owner) => owner.revenueVnd)],
              ['threshold-total', t('thresholdTotal'), figure(actual, example.expected, (owner) => owner.thresholdTotalVnd)],
              ['vat', t('vat'), figure(actual, example.expected, (owner) => owner.vatVnd)],
              ['pit', t('pit'), figure(actual, example.expected, (owner) => owner.pitVnd)],
              [
                'notes',
                t('notes'),
                rule === null
                  ? []
                  : [
                      ...actual
                        .filter((owner) => owner.withheldVnd > 0)
                        .map((owner) => t('withheld', { label: notes('tenantWithholds'), amount: money(owner.withheldVnd) })),
                      ...[...new Set(actual.flatMap((owner) => owner.notes))]
                        .filter((key) => key !== 'estimate_disclaimer' && key !== 'pit_effective_date')
                        .map((key) => taxNoteText(key, rule, notes)),
                    ],
              ],
              ['result', t('result'), [matches ? 'OK' : 'MISMATCH']],
            ];
            return (
              <tr
                key={example.id}
                data-example={example.id}
                data-match={matches ? 'match' : 'mismatch'}
                className="border-b align-top max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:py-2"
              >
                {cells.map(([cell, label, lines]) => (
                  <td key={cell} className={`py-1 pr-4 wrap-anywhere max-sm:contents ${cell === 'result' && !matches ? 'font-medium underline' : ''}`}>
                    <span aria-hidden="true" className="font-sans font-normal text-meta sm:hidden">
                      {label}
                    </span>
                    <span data-cell={cell} className="flex flex-col">
                      {lines.map((line, i) => (
                        <span key={i}>{line}</span>
                      ))}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
