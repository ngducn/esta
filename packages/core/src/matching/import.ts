import { daysBetween } from '../date/calendar';
import { vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { identifyRows } from './fingerprint';
import { matchRows, type InvoiceCandidate, type StatementMatch } from './match';
import { normalizeDescription } from './memo';

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

/** The rows to store, and for each line left out because an earlier import holds it, that import's id. */
export type PlannedImport = { readonly rows: readonly ImportRow[]; readonly known: readonly string[] };

/** A line an earlier import of the household holds, as the lines of a new statement are compared with it. */
export type StoredLine = Pick<StatementRow, 'date' | 'amount' | 'bankRef' | 'description'> & {
  readonly fingerprint: string;
  readonly importId: string;
  /** Held by an import into the account the new statement is for. */
  readonly sameAccount: boolean;
};

/** Days a bank reference still names the same transfer, so a value date read in place of a transaction date matches. */
export const REFERENCE_WINDOW_DAYS = 3;

function grouped(lines: readonly StoredLine[], key: (line: StoredLine) => string): Map<string, StoredLine[]> {
  const groups = new Map<string, StoredLine[]>();
  for (const line of lines) {
    const group = groups.get(key(line));
    if (group === undefined) groups.set(key(line), [line]);
    else group.push(line);
  }
  return groups;
}

const sameText = (line: Pick<StatementRow, 'date' | 'amount' | 'description'>) => [line.date, String(line.amount), normalizeDescription(line.description)].join('\n');
const sameReference = (line: Pick<StatementRow, 'amount' | 'bankRef'>) => [String(line.amount), line.bankRef].join('\n');

/**
 * The stored line each line of a new statement is, or undefined for a new transfer ([app rule] DOMAIN-VN §9, P3-21), so
 * reading the same statement under other columns records nothing twice. A line is known when the household holds its
 * #58 fingerprint, or when the same account holds a line of the same amount that either has an equal bank reference
 * dated within REFERENCE_WINDOW_DAYS, or is on the same date with the same description after `normalizeDescription`.
 * Each stored line answers for one new line at most, so the nth identical line of a file is known only while the
 * account holds n of them, and two identical counter deposits stay two.
 */
export function knownLines(rows: readonly StatementRow[], stored: readonly StoredLine[]): (StoredLine | undefined)[] {
  const byFingerprint = grouped(stored, (line) => line.fingerprint);
  const own = stored.filter((line) => line.sameAccount);
  const byReference = grouped(
    own.filter((line) => line.bankRef !== ''),
    sameReference,
  );
  const byText = grouped(own, sameText);
  const claimed = new Set<StoredLine>();
  const known = identifyRows(rows).map(({ fingerprint }) => {
    const lines = byFingerprint.get(fingerprint) ?? [];
    for (const line of lines) claimed.add(line);
    return lines[0];
  });
  const claim = (i: number, candidates: readonly StoredLine[]) => {
    const line = candidates.find((candidate) => !claimed.has(candidate));
    if (known[i] !== undefined || line === undefined) return;
    claimed.add(line);
    known[i] = line;
  };
  rows.forEach((row, i) => {
    if (row.bankRef === '') return;
    const near = (line: StoredLine) => Math.abs(daysBetween(line.date, row.date));
    claim(
      i,
      (byReference.get(sameReference(row)) ?? []).filter((line) => near(line) <= REFERENCE_WINDOW_DAYS).toSorted((a, b) => near(a) - near(b)),
    );
  });
  rows.forEach((row, i) => claim(i, byText.get(sameText(row)) ?? []));
  return known;
}

function asStored(match: StatementMatch): Omit<ImportRow, 'row' | 'fingerprint'> {
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
 * never suggested. Lines an earlier import holds (`knownLines`) are left out, so a re-import stores nothing.
 */
export function planImport(rows: readonly StatementRow[], invoices: readonly ImportInvoice[], stored: readonly StoredLine[]): PlannedImport {
  const candidates = invoices.map((invoice) => (invoice.status === 'void' ? { ...invoice, outstanding: vnd(0) } : invoice));
  const known = knownLines(rows, stored);
  const kept: ImportRow[] = [];
  const skipped: string[] = [];
  matchRows(rows, candidates).forEach(({ row, fingerprint, match }, i) => {
    const line = known[i];
    if (line === undefined) kept.push({ row, fingerprint, ...asStored(match) });
    else skipped.push(line.importId);
  });
  return { rows: kept, known: skipped };
}
