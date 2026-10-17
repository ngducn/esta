import type { Vnd } from '../money/vnd';
import type { OwnerRevenue } from './attribute';
import type { TaxRule } from './rules';

export type TaxNoteLabel = 'disclaimer' | 'assumption' | 'ask_accountant';

type NoteContext = { rule: TaxRule; attribution: OwnerRevenue; otherBusinessRevenueVnd: Vnd };

type TaxNote = {
  label: TaxNoteLabel;
  /** Key in the `taxNotes` message namespace. */
  messageKey: string;
  /** Whether the note's text embeds the rule's own `note`. */
  showsRuleNote: boolean;
  active: (context: NoteContext) => boolean;
};

export const TAX_NOTES = {
  estimate_disclaimer: { label: 'disclaimer', messageKey: 'estimateDisclaimer', showsRuleNote: false, active: () => true },
  pit_effective_date: {
    label: 'assumption',
    messageKey: 'pitEffectiveDate',
    showsRuleNote: true,
    active: ({ rule }) => rule.note !== null,
  },
  co_owner_split: {
    label: 'assumption',
    messageKey: 'coOwnerSplit',
    showsRuleNote: false,
    active: ({ attribution }) =>
      attribution.leases.some((lease) => lease.basis.kind === 'ownership_share' && lease.basis.shareBp < 10_000),
  },
  deduction_split: {
    label: 'ask_accountant',
    messageKey: 'deductionSplit',
    showsRuleNote: false,
    active: ({ otherBusinessRevenueVnd }) => otherBusinessRevenueVnd > 0,
  },
  utility_excluded: { label: 'assumption', messageKey: 'utilityExcluded', showsRuleNote: false, active: () => true },
} as const satisfies Record<string, TaxNote>;

export type TaxNoteKey = keyof typeof TAX_NOTES;

export function activeTaxNotes(context: NoteContext): TaxNoteKey[] {
  return (Object.keys(TAX_NOTES) as TaxNoteKey[]).filter((key) => TAX_NOTES[key].active(context));
}
