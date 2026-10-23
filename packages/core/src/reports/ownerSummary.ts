import { textCell, vndCell, type ExportCell, type ExportTable } from '../export/table';
import { vnd, type Vnd } from '../money/vnd';
import { splitByShares } from '../tax/attribute';
import { toTaxInputs } from '../tax/inputs';
import { computeTaxPosition, type TaxPosition } from '../tax/position';
import { propertyLedger } from './propertyPnl';
import type { ReportSnapshot } from './snapshot';

export type OwnerSummaryLabels = {
  readonly owner: string;
  readonly revenue: string;
  readonly income: string;
  readonly expenses: string;
  readonly vat: string;
  readonly pit: string;
  readonly total: string;
  readonly unattributed: string;
  readonly noRule: string;
};

/** The key of the row that carries what no owner's share covers. */
export const UNATTRIBUTED = 'unattributed';

const collator = new Intl.Collator('vi', { numeric: true });

type Split = { income: number; expenses: number };

/** Each property's P&L income and expenses for the period, split by its ownership shares the way tax attribution splits revenue. */
function splitLedgers(snapshot: ReportSnapshot): Map<string, Split> {
  const split = new Map<string, Split>();
  const add = (key: string, field: keyof Split, amount: Vnd) => {
    const entry = split.get(key) ?? { income: 0, expenses: 0 };
    entry[field] += amount;
    split.set(key, entry);
  };
  for (const property of snapshot.properties) {
    const shares = snapshot.tax.shares.filter((share) => share.propertyId === property.id);
    const { totals } = propertyLedger(snapshot, property.id);
    for (const [field, amount] of [['income', totals.incomeVnd], ['expenses', totals.expensesVnd]] as const) {
      const parts = splitByShares(amount, shares);
      for (const owner of parts.owners) add(owner.partyId, field, owner.amountVnd);
      add(UNATTRIBUTED, field, parts.unattributedVnd);
    }
  }
  return split;
}

/**
 * FIN-4: one row per owner for the year of the period, keyed by party id. Revenue and the VAT and PIT estimates are the
 * owner's tax card (`computeTaxPosition` over `toTaxInputs`); income received and expenses are each live property's P&L
 * split by ownership share, with a last row for any part no share covers, so the rows add up to the P&L totals.
 */
export function ownerSummary(snapshot: ReportSnapshot, labels: OwnerSummaryLabels): ExportTable {
  const year = Number(snapshot.from.slice(0, 4));
  const split = splitLedgers(snapshot);
  const owners = snapshot.owners.toSorted((a, b) => collator.compare(a.name, b.name)).map((owner) => {
    const inputs = toTaxInputs({ ...snapshot.tax, otherBusinessRevenueVnd: owner.otherBusinessRevenueVnd }, { partyId: owner.id, year, asOf: snapshot.asOf });
    return { key: owner.id, name: owner.name, position: inputs.kind === 'rule' ? computeTaxPosition(inputs) : null, split: split.get(owner.id) ?? { income: 0, expenses: 0 } };
  });
  const rest = split.get(UNATTRIBUTED);
  const lines = rest === undefined || rest.income + rest.expenses === 0 ? owners : [...owners, { key: UNATTRIBUTED, name: labels.unattributed, position: null, split: rest }];
  const tax = (position: TaxPosition | null, field: 'projectedVnd' | 'vatEstimateVnd' | 'pitEstimateVnd', key: string): ExportCell => {
    if (position !== null) return vndCell(position[field]);
    return textCell(key === UNATTRIBUTED ? '' : labels.noRule);
  };
  const sum = (pick: (line: (typeof lines)[number]) => number) => vndCell(vnd(lines.reduce((total, line) => total + pick(line), 0)));
  return {
    columns: [
      { id: 'owner', label: labels.owner },
      { id: 'revenue', label: labels.revenue },
      { id: 'income', label: labels.income },
      { id: 'expenses', label: labels.expenses },
      { id: 'vat', label: labels.vat },
      { id: 'pit', label: labels.pit },
    ],
    rows: lines.map((line) => ({
      key: line.key,
      cells: [
        textCell(line.name),
        tax(line.position, 'projectedVnd', line.key),
        vndCell(vnd(line.split.income)),
        vndCell(vnd(line.split.expenses)),
        tax(line.position, 'vatEstimateVnd', line.key),
        tax(line.position, 'pitEstimateVnd', line.key),
      ],
    })),
    totals: {
      key: 'total',
      cells: [
        textCell(labels.total),
        sum((line) => line.position?.projectedVnd ?? 0),
        sum((line) => line.split.income),
        sum((line) => line.split.expenses),
        sum((line) => line.position?.vatEstimateVnd ?? 0),
        sum((line) => line.position?.pitEstimateVnd ?? 0),
      ],
    },
  };
}
