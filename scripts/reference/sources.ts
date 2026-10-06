import { inflateRawSync } from 'node:zlib';

function readZip(buffer: Buffer): Map<string, Buffer> {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('not a zip file');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`zip entry ${name} uses method ${method}`);
    entries.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
      return ENTITIES[name] ?? match;
    })
    .replace(/_x([0-9A-F]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function textRuns(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? '')).join('');
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0];
  if (letters === undefined) throw new Error(`bad cell reference ${ref}`);
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function entryText(entries: Map<string, Buffer>, name: string): string {
  const entry = entries.get(name);
  if (entry === undefined) throw new Error(`xlsx has no ${name}`);
  return entry.toString('utf8');
}

export type SheetRow = (string | null)[];

/** Cells of the sheet at `sheetIndex` in workbook order, as text, with null for empty cells. */
export function readXlsxSheet(file: Buffer, sheetIndex: number): SheetRow[] {
  const entries = readZip(file);
  const sheetIds = [...entryText(entries, 'xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/>/g)].map((m) =>
    attribute(m[1] ?? '', 'r:id'),
  );
  const targets = new Map(
    [...entryText(entries, 'xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/>/g)].map((m) => [
      attribute(m[1] ?? '', 'Id'),
      attribute(m[1] ?? '', 'Target'),
    ]),
  );
  const target = targets.get(sheetIds[sheetIndex]);
  if (target === undefined) throw new Error(`xlsx has no sheet ${sheetIndex}`);
  const shared = entries.has('xl/sharedStrings.xml')
    ? [...entryText(entries, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1] ?? ''))
    : [];

  const rows: SheetRow[] = [];
  const sheet = entryText(entries, `xl/${target.replace(/^\/?xl\//, '')}`);
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowNumber = Number(attribute(rowMatch[1] ?? rowMatch[3] ?? '', 'r'));
    const cells: SheetRow = [];
    for (const cell of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? '';
      const body = cell[2] ?? '';
      const ref = attribute(attributes, 'r');
      if (ref === undefined) throw new Error(`cell without a reference in row ${rowNumber}`);
      const type = attribute(attributes, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: string | null;
      if (type === 'inlineStr') value = textRuns(body);
      else if (raw === undefined) value = null;
      else if (type === 's') value = shared[Number(raw)] ?? null;
      else value = decodeXml(raw);
      cells[columnIndex(ref)] = value;
    }
    rows[rowNumber - 1] = Array.from(cells, (value) => value ?? null);
  }
  return Array.from(rows, (row) => row ?? []);
}

export type SoapRecord = Record<string, string>;

/** The `TABLE` records of an NSO DMDVHC SOAP response, one field per child element. */
export function readSoapTable(xml: string): SoapRecord[] {
  return [...xml.matchAll(/<TABLE\b[^>]*>([\s\S]*?)<\/TABLE>/g)].map((table) =>
    Object.fromEntries(
      [...(table[1] ?? '').matchAll(/<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((field) => [
        field[1] ?? '',
        decodeXml(field[2] ?? ''),
      ]),
    ),
  );
}
