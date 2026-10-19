const DELIMITERS = [',', ';', '\t'] as const;

/** The delimiter the header line uses most outside quotes. Excel on a Vietnamese system writes `;`, since `,` is its decimal mark. */
function delimiterOf(text: string): string {
  const counts = new Map<string, number>();
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return DELIMITERS.reduce((best, next) => ((counts.get(next) ?? 0) > (counts.get(best) ?? 0) ? next : best));
}

/**
 * The rows of a CSV file as text cells, as RFC 4180 reads them: a quoted cell may hold the delimiter, a line break or
 * a doubled quote. A leading byte order mark and a final line break are dropped. Every cell stays text; what it means
 * is for the money and date parsers to say.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const delimiter = delimiterOf(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[index + 1] === '"') cell += source[++index];
      else quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows;
}
