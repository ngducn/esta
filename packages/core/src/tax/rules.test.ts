import { describe, expect, it } from 'vitest';
import taxRules from '../../../../supabase/seed/reference/tax_rules.json';
import { selectTaxRule, taxRuleRowSchema, type TaxRule } from './rules';

const [seededRow] = taxRules;
if (seededRow === undefined) throw new Error('tax_rules.json has no row');

describe('taxRuleRowSchema', () => {
  it('parses the seeded DOMAIN-VN §5 row', () => {
    expect(taxRuleRowSchema.parse(seededRow)).toEqual({
      kind: 'vn_rental_individual',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      thresholdVnd: 500_000_000,
      vatRateBp: 500,
      vatBase: 'total_rental_revenue_when_over_threshold',
      pitRateBp: 500,
      pitBase: 'revenue_above_threshold',
      sourceCitation: 'Luật Thuế TNCN 109/2025/QH15; Luật sửa đổi Luật Thuế GTGT; Nghị định 68/2026/NĐ-CP',
      note: 'Các nguồn chưa thống nhất phần thuế TNCN áp dụng từ 01/01/2026 hay 01/07/2026. Cần xác minh.',
    });
  });

  it.each([
    ['an unknown pit_base', { params: { ...seededRow.params, pit_base: 'revenue_above_threshold_per_lease' } }],
    ['an unknown vat_base', { params: { ...seededRow.params, vat_base: 'self_declared_revenue' } }],
    ['an unknown threshold_scope', { params: { ...seededRow.params, threshold_scope: 'per_property' } }],
    ['a fractional rate', { params: { ...seededRow.params, vat_rate_bp: 2.5 } }],
    ['a zero threshold', { params: { ...seededRow.params, threshold_vnd: 0 } }],
    ['an impossible date', { effective_from: '2026-02-30' }],
    ['an unknown kind', { kind: 'vn_rental_company' }],
  ])('rejects %s', (_label, change) => {
    expect(taxRuleRowSchema.safeParse({ ...seededRow, ...change }).success).toBe(false);
  });
});

describe('selectTaxRule', () => {
  const rule = (effectiveFrom: string, effectiveTo: string | null): TaxRule =>
    taxRuleRowSchema.parse({ ...seededRow, effective_from: effectiveFrom, effective_to: effectiveTo });
  const seeded = rule('2026-01-01', null);

  it('returns no_rule for 2025, before the seeded rule', () => {
    expect(selectTaxRule([seeded], 2025)).toEqual({ kind: 'no_rule', year: 2025 });
  });

  it('returns the seeded rule for 2026 and later years', () => {
    expect(selectTaxRule([seeded], 2026)).toEqual({ kind: 'rule', rule: seeded });
    expect(selectTaxRule([seeded], 2031)).toEqual({ kind: 'rule', rule: seeded });
  });

  it('picks the latest effective_from in force during the year, even one starting mid-year', () => {
    const july = rule('2026-07-01', null);
    expect(selectTaxRule([july, seeded], 2026)).toEqual({ kind: 'rule', rule: july });
  });

  it('keeps a rule whose effective_to falls on 1 January and drops one that ended the year before', () => {
    const ended = rule('2024-01-01', '2026-01-01');
    expect(selectTaxRule([ended], 2026)).toEqual({ kind: 'rule', rule: ended });
    expect(selectTaxRule([rule('2024-01-01', '2025-12-31')], 2026)).toEqual({ kind: 'no_rule', year: 2026 });
  });

  it('returns no_rule for an empty rule set', () => {
    expect(selectTaxRule([], 2026)).toEqual({ kind: 'no_rule', year: 2026 });
  });
});
