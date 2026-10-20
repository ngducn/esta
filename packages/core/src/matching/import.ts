import { vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { matchRows, type InvoiceCandidate, type StatementMatch } from './match';

/**
 * An issued or voided bill as an import sees it. A void bill keeps its memo code, so a line naming it is stored as a
 * memo match that the database then reads as naming a voided bill (`statement_line_state`), never as postable money.
 */
export type ImportInvoice = InvoiceCandidate & { readonly status: 'issued' | 'void' };

export type ImportStatus = 'memo_match' | 'suggested' | 'unmatched' | 'ignored';

/** Why a row is ignored, or left for a person: `repeat` is a later identical line without a bank reference. */
export type ImportReason = 'debit' | 'duplicate' | 'repeat';

export type ImportRow = {
  readonly row: StatementRow;
  readonly fingerprint: string;
  readonly status: ImportStatus;
  readonly reason: ImportReason | null;
  readonly invoiceId: string | null;
  readonly candidateIds: readonly string[];
};

/** The rows to store, and the fingerprints of the lines an earlier import already holds, which are left out. */
export type PlannedImport = { readonly rows: readonly ImportRow[]; readonly known: readonly string[] };

function stored(match: StatementMatch): Omit<ImportRow, 'row' | 'fingerprint'> {
  switch (match.status) {
    case 'ignored':
      return { status: 'ignored', reason: match.reason, invoiceId: null, candidateIds: [] };
    case 'unmatched':
      return { status: 'unmatched', reason: 'repeatOf' in match ? 'repeat' : null, invoiceId: null, candidateIds: match.candidateIds };
    case 'suggested':
      return { status: 'suggested', reason: null, invoiceId: match.invoiceId, candidateIds: [] };
    case 'memo_match':
      return { status: 'memo_match', reason: null, invoiceId: match.invoiceId, candidateIds: [] };
  }
}

/**
 * LSE-8 matching over the household's issued and voided bills, as the lines to store. Whether a stored line may post
 * (its bill paid, voided or paid by hand since) is the database's to say when it is read and committed. A void bill is
 * never suggested. Lines an earlier import holds (`known`) are left out, so a re-import stores nothing.
 */
export function planImport(rows: readonly StatementRow[], invoices: readonly ImportInvoice[], known: ReadonlySet<string>): PlannedImport {
  const candidates = invoices.map((invoice) => (invoice.status === 'void' ? { ...invoice, outstanding: vnd(0) } : invoice));
  const kept: ImportRow[] = [];
  const skipped: string[] = [];
  for (const { row, fingerprint, match } of matchRows(rows, candidates, { knownFingerprints: known })) {
    if (known.has(fingerprint)) skipped.push(fingerprint);
    else kept.push({ row, fingerprint, ...stored(match) });
  }
  return { rows: kept, known: skipped };
}
