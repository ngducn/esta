import type { Result } from '../result';

/** A CSV record that cannot be split into cells with certainty. */
export type CsvReason = 'stray_quote' | 'unterminated_quote';
export type CsvRecord = Result<string[], CsvReason>;

const DELIMITERS = [',', ';', '\t'] as const;

/** Excel on a Vietnamese system writes `;`, since `,` is its decimal mark. */
function detectDelimiter(firstLine: string): string {
  let best: string = DELIMITERS[0];
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) [best, bestCount] = [delimiter, count];
  }
  return best;
}

const isLineEnd = (char: string | undefined): boolean => char === '\n' || char === '\r';

function afterLineEnd(body: string, at: number): number {
  return body[at] === '\r' && body[at + 1] === '\n' ? at + 2 : at + 1;
}

/** The index of the quote that closes a quoted field opened just before `from`, or -1. */
function closingQuote(body: string, from: number, spanLines: boolean): number {
  for (let at = from; at < body.length && (spanLines || !isLineEnd(body[at])); at++) {
    if (body[at] !== '"') continue;
    if (body[at + 1] !== '"') return at;
    at++;
  }
  return -1;
}

function readRecord(body: string, start: number, delimiter: string, spanLines: boolean): { record: CsvRecord; next: number } {
  const cells: string[] = [];
  let stray = false;
  let at = start;
  for (;;) {
    let field = '';
    if (body[at] === '"') {
      const close = closingQuote(body, at + 1, spanLines);
      if (close === -1) {
        const lineEnd = body.slice(at).search(/[\r\n]/);
        const next = lineEnd === -1 ? body.length : afterLineEnd(body, at + lineEnd);
        return { record: { ok: false, reason: 'unterminated_quote' }, next };
      }
      field = body.slice(at + 1, close).replaceAll('""', '"');
      at = close + 1;
      if (at < body.length && body[at] !== delimiter && !isLineEnd(body[at])) stray = true;
    }
    for (; at < body.length && body[at] !== delimiter && !isLineEnd(body[at]); at++) {
      if (body[at] === '"') stray = true;
      field += body[at];
    }
    cells.push(field);
    if (body[at] === delimiter) {
      at++;
      continue;
    }
    return { record: stray ? { ok: false, reason: 'stray_quote' } : { ok: true, value: cells }, next: afterLineEnd(body, at) };
  }
}

/**
 * RFC 4180 text to records: a leading BOM, CRLF, quoted fields and doubled quotes are handled, the delimiter is the one
 * the first line uses most, and every cell stays text. A quote opens a field only at its start. A record with a quote
 * anywhere else, or whose quote does not close, is refused and reading resumes on the next line. With `spanLines`, a
 * quoted field may hold a line break, as a spreadsheet cell can. A bank statement carries one transaction per line, so
 * it reads without: a quote must close on its own line, and one bad line costs one row.
 */
export function parseCsv(text: string, { spanLines }: { spanLines: boolean }): CsvRecord[] {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const delimiter = detectDelimiter(body.slice(0, body.search(/\r?\n|$/)));
  const records: CsvRecord[] = [];
  for (let at = 0; at < body.length; ) {
    const { record, next } = readRecord(body, at, delimiter, spanLines);
    records.push(record);
    at = next;
  }
  return records;
}
