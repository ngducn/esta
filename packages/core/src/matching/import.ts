import { vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { matchRows, type InvoiceCandidate, type StatementMatch } from './match';

/** An issued or voided bill as an import sees it. A void bill keeps its memo code, so a transfer naming it is caught. */
export type ImportInvoice = InvoiceCandidate & { readonly status: 'issued' | 'void' };

export type ImportStatus = 'memo_match' | 'suggested' | 'unmatched' | 'ignored';

/**
 * Why a row is ignored, or left for a person: `repeat` is a later identical line without a bank reference, `paid` a
 * memo naming a bill that owes nothing, `void` one naming a voided bill.
 */
export type ImportReason = 'debit' | 'duplicate' | 'repeat' | 'paid' | 'void';

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

function stored(match: StatementMatch, invoices: ReadonlyMap<string, ImportInvoice>): Omit<ImportRow, 'row' | 'fingerprint'> {
  switch (match.status) {
    case 'ignored':
      return { status: 'ignored', reason: match.reason, invoiceId: null, candidateIds: [] };
    case 'unmatched':
      return { status: 'unmatched', reason: 'repeatOf' in match ? 'repeat' : null, invoiceId: null, candidateIds: match.candidateIds };
    case 'suggested':
      return { status: 'suggested', reason: null, invoiceId: match.invoiceId, candidateIds: [] };
    case 'memo_match': {
      const invoice = invoices.get(match.invoiceId);
      if (invoice?.status === 'void') return { status: 'unmatched', reason: 'void', invoiceId: null, candidateIds: [match.invoiceId] };
      if (invoice === undefined || invoice.outstanding <= 0) return { status: 'unmatched', reason: 'paid', invoiceId: null, candidateIds: [match.invoiceId] };
      return { status: 'memo_match', reason: null, invoiceId: match.invoiceId, candidateIds: [] };
    }
  }
}

/**
 * LSE-8 over the household's issued and voided bills. A memo naming a bill that owes nothing or was voided waits for a
 * person instead of posting: the transfer may already be recorded by hand, or belong to the bill that replaced it.
 * A void bill is never suggested. Lines an earlier import holds (`known`) are left out, so a re-import stores nothing.
 */
export function planImport(rows: readonly StatementRow[], invoices: readonly ImportInvoice[], known: ReadonlySet<string>): PlannedImport {
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const candidates = invoices.map((invoice) => (invoice.status === 'void' ? { ...invoice, outstanding: vnd(0) } : invoice));
  const kept: ImportRow[] = [];
  const skipped: string[] = [];
  for (const { row, fingerprint, match } of matchRows(rows, candidates, { knownFingerprints: known })) {
    if (known.has(fingerprint)) skipped.push(fingerprint);
    else kept.push({ row, fingerprint, ...stored(match, byId) });
  }
  return { rows: kept, known: skipped };
}
