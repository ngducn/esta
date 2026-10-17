import { z } from 'zod';
import { isIsoDate, type IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';

export type TaxBaseInput = { selfDeclaredVnd: Vnd; thresholdVnd: Vnd; overThreshold: boolean };

const ZERO = vnd(0);

export const VAT_BASES = {
  total_rental_revenue_when_over_threshold: ({ selfDeclaredVnd, overThreshold }: TaxBaseInput) =>
    overThreshold ? selfDeclaredVnd : ZERO,
} as const satisfies Record<string, (input: TaxBaseInput) => Vnd>;

/** The threshold comes off self-declared rental revenue first, so other business revenue never shrinks the deduction. */
export const PIT_BASES = {
  revenue_above_threshold: ({ selfDeclaredVnd, thresholdVnd, overThreshold }: TaxBaseInput) =>
    overThreshold ? vnd(Math.max(0, selfDeclaredVnd - thresholdVnd)) : ZERO,
} as const satisfies Record<string, (input: TaxBaseInput) => Vnd>;

export type VatBase = keyof typeof VAT_BASES;
export type PitBase = keyof typeof PIT_BASES;

const isoDateSchema = z
  .string()
  .refine(isIsoDate)
  .transform((text) => text as IsoDate);
const vndSchema = z.number().int().nonnegative().transform(vnd);
const bpSchema = z.number().int().min(0).max(10_000);

export const taxRuleRowSchema = z
  .object({
    kind: z.literal('vn_rental_individual'),
    effective_from: isoDateSchema,
    effective_to: isoDateSchema.nullable(),
    params: z.object({
      threshold_vnd: vndSchema.refine((amount) => amount > 0),
      threshold_scope: z.literal('all_business_revenue_of_person'),
      vat_rate_bp: bpSchema,
      vat_base: z.enum(Object.keys(VAT_BASES) as [VatBase, ...VatBase[]]),
      pit_rate_bp: bpSchema,
      pit_base: z.enum(Object.keys(PIT_BASES) as [PitBase, ...PitBase[]]),
    }),
    source_citation: z.string().min(1),
    note: z.string().min(1).nullable(),
  })
  .transform((row) => ({
    kind: row.kind,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    thresholdVnd: row.params.threshold_vnd,
    vatRateBp: row.params.vat_rate_bp,
    vatBase: row.params.vat_base,
    pitRateBp: row.params.pit_rate_bp,
    pitBase: row.params.pit_base,
    sourceCitation: row.source_citation,
    note: row.note,
  }));

export type TaxRule = z.output<typeof taxRuleRowSchema>;

export type TaxRuleSet = readonly TaxRule[];

export type TaxRuleSelection = { kind: 'rule'; rule: TaxRule } | { kind: 'no_rule'; year: number };

/** The rule in force for any part of `year`; the latest `effective_from` wins when several overlap it. */
export function selectTaxRule(rules: TaxRuleSet, year: number): TaxRuleSelection {
  const first = `${String(year).padStart(4, '0')}-01-01`;
  const last = `${String(year).padStart(4, '0')}-12-31`;
  let chosen: TaxRule | undefined;
  for (const rule of rules) {
    if (rule.effectiveFrom > last || (rule.effectiveTo !== null && rule.effectiveTo < first)) continue;
    if (chosen === undefined || rule.effectiveFrom > chosen.effectiveFrom) chosen = rule;
  }
  return chosen === undefined ? { kind: 'no_rule', year } : { kind: 'rule', rule: chosen };
}
