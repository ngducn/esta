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

/** Days apart two readings of one transfer without bank references may be dated, as when a value date is read in place of a transaction date. */
export const KNOWN_WINDOW_DAYS = 3;

/** Days apart two readings of one transfer with the same bank reference may be dated: a bank re-dates a transfer to its value date after a break such as Tết or 30/4. */
const KNOWN_REFERENCE_WINDOW_DAYS = 14;

function grouped(lines: readonly StoredLine[], key: (line: StoredLine) => string): Map<string, StoredLine[]> {
  const groups = new Map<string, StoredLine[]>();
  for (const line of lines) {
    const group = groups.get(key(line));
    if (group === undefined) groups.set(key(line), [line]);
    else group.push(line);
  }
  return groups;
}

/**
 * The stored line each line of a new statement is, or undefined for a new transfer ([app rule] DOMAIN-VN §9, P3-21), so
 * reading the same statement under other columns records nothing twice. A line is known when the household holds its
 * #58 fingerprint, or when the same account holds a line of the same amount that, if both carry a bank reference, has
 * the same reference and a date within KNOWN_REFERENCE_WINDOW_DAYS, and otherwise has the same description after
 * `normalizeDescription` and a date within KNOWN_WINDOW_DAYS. The reference window stops short of a month, so a short
 * reference a bank reuses never hides the next month's rent (issue #266). Each stored line answers for one new line at
 * most, an equal reference and then the nearest date first, so the nth identical line of a file is known only while the
 * account holds n of them and two identical counter deposits stay two.
 */
export function knownLines(rows: readonly StatementRow[], stored: readonly StoredLine[]): (StoredLine | undefined)[] {
  const byFingerprint = grouped(stored, (line) => line.fingerprint);
  const own = stored.filter((line) => line.sameAccount);
  const byAmount = grouped(own, (line) => String(line.amount));
  const texts = new Map(own.map((line) => [line, normalizeDescription(line.description)]));
  const claimed = new Set<StoredLine>();
  const known = identifyRows(rows).map(({ fingerprint }) => {
    const lines = byFingerprint.get(fingerprint) ?? [];
    for (const line of lines) claimed.add(line);
    return lines[0];
  });
  rows.forEach((row, i) => {
    if (known[i] !== undefined) return;
    const text = normalizeDescription(row.description);
    const days = (line: StoredLine) => Math.abs(daysBetween(line.date, row.date));
    const referenced = (line: StoredLine) => line.bankRef !== '' && row.bankRef !== '';
    const same = (line: StoredLine) =>
      referenced(line)
        ? line.bankRef === row.bankRef && days(line) <= KNOWN_REFERENCE_WINDOW_DAYS
        : texts.get(line) === text && days(line) <= KNOWN_WINDOW_DAYS;
    const [line] = (byAmount.get(String(row.amount)) ?? [])
      .filter((candidate) => !claimed.has(candidate) && same(candidate))
      .toSorted((a, b) => Number(!referenced(a)) - Number(!referenced(b)) || days(a) - days(b));
    if (line === undefined) return;
    claimed.add(line);
    known[i] = line;
  });
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
