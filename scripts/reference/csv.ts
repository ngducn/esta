export type CsvRecord = Record<string, string>;

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function formatCsv(columns: readonly string[], rows: readonly CsvRecord[]): string {
  const lines = [columns.map(quote).join(',')];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = row[column];
          if (value === undefined) throw new Error(`CSV row has no ${column}: ${JSON.stringify(row)}`);
          return quote(value);
        })
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function parseLines(text: string): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      line.push(field);
      field = '';
    } else if (char === '\n') {
      line.push(field);
      lines.push(line);
      line = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || line.length > 0) {
    line.push(field);
    lines.push(line);
  }
  return lines;
}

export function parseCsv(text: string, columns: readonly string[]): CsvRecord[] {
  const [header, ...body] = parseLines(text);
  if (header?.join(',') !== columns.join(',')) {
    throw new Error(`CSV header is ${header?.join(',')}, expected ${columns.join(',')}`);
  }
  return body.map((cells, index) => {
    if (cells.length !== columns.length) {
      throw new Error(`CSV line ${index + 2} has ${cells.length} fields, expected ${columns.length}`);
    }
    return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? '']));
  });
}
