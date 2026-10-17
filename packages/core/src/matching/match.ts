import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { rowFingerprints } from './fingerprint';
import { findMemoCodes, normalizeDescription } from './memo';

/** An issued invoice as the matcher sees it. The caller derives `outstanding` from allocations. */
export type InvoiceCandidate = {
  id: string;
  memoCode: string;
  tenantName: string;
  dueDate: IsoDate;
  /** Still unpaid. A paid invoice has zero; it can take a memo match but never a suggestion, since a credit row is positive. */
  outstanding: Vnd;
};

/** A row dated this many days or fewer from the due date can be suggested (SPEC LSE-8). */
export const SUGGESTION_WINDOW_DAYS = 10;

export type StatementMatch =
  | { status: 'memo_match'; invoiceId: string; memoCode: string }
  | { status: 'suggested'; invoiceId: string }
  /** Zero candidates, or two or more that the operator must choose between. */
  | { status: 'unmatched'; candidateIds: readonly string[] }
  /** `debit` covers any row that brings no money in; `duplicate` a row an earlier import already holds. */
  | { status: 'ignored'; reason: 'debit' | 'duplicate' };

export type MatchedRow = { row: StatementRow; fingerprint: string; match: StatementMatch };

export type MatchOptions = {
  /** Fingerprints of rows an earlier import already holds, so re-importing the same file matches nothing. */
  knownFingerprints?: ReadonlySet<string>;
};

type Indexed = { invoice: InvoiceCandidate; normalizedName: string };

function byDueDateThenId(a: InvoiceCandidate, b: InvoiceCandidate): number {
  return a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id);
}

function decide(candidates: InvoiceCandidate[], ifOne: (invoice: InvoiceCandidate) => StatementMatch): StatementMatch {
  const [only] = candidates;
  if (only !== undefined && candidates.length === 1) return ifOne(only);
  return { status: 'unmatched', candidateIds: [...candidates].sort(byDueDateThenId).map((invoice) => invoice.id) };
}

function withinWindow(row: StatementRow, invoice: InvoiceCandidate): boolean {
  return Math.abs(daysBetween(invoice.dueDate, row.date)) <= SUGGESTION_WINDOW_DAYS;
}

function matchRow(row: StatementRow, index: Indexed[], issuedCodes: ReadonlySet<string>): StatementMatch {
  if (row.amount <= 0) return { status: 'ignored', reason: 'debit' };

  const codes = findMemoCodes(row.description, issuedCodes);
  if (codes.length > 0) {
    const named = index.filter(({ invoice }) => codes.includes(invoice.memoCode)).map(({ invoice }) => invoice);
    return decide(named, (invoice) => ({ status: 'memo_match', invoiceId: invoice.id, memoCode: invoice.memoCode }));
  }

  const description = normalizeDescription(row.description);
  const suggested = index
    .filter(
      ({ invoice, normalizedName }) =>
        invoice.outstanding === row.amount &&
        normalizedName !== '' &&
        description.includes(normalizedName) &&
        withinWindow(row, invoice),
    )
    .map(({ invoice }) => invoice);
  return decide(suggested, (invoice) => ({ status: 'suggested', invoiceId: invoice.id }));
}

/**
 * The LSE-8 rules. A credit row naming exactly one issued memo code is `memo_match`. A credit row
 * whose amount equals the outstanding amount of exactly one invoice, whose tenant's name appears in
 * the description and whose date is within ten days of the due date is `suggested`. Everything
 * else is `unmatched`, with the candidates when there were several. Rows that bring no money in
 * and rows an earlier import already holds are `ignored`.
 */
export function matchRows(
  rows: readonly StatementRow[],
  invoices: readonly InvoiceCandidate[],
  options: MatchOptions = {},
): MatchedRow[] {
  const index: Indexed[] = invoices.map((invoice) => ({ invoice, normalizedName: normalizeDescription(invoice.tenantName) }));
  const issuedCodes = new Set(invoices.map((invoice) => invoice.memoCode));
  const known = options.knownFingerprints ?? new Set<string>();
  const fingerprints = rowFingerprints(rows);
  return rows.map((row, i) => {
    const fingerprint = fingerprints[i] as string;
    const match: StatementMatch = known.has(fingerprint) ? { status: 'ignored', reason: 'duplicate' } : matchRow(row, index, issuedCodes);
    return { row, fingerprint, match };
  });
}
