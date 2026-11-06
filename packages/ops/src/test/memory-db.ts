import { readFileSync } from 'node:fs';
import type { Db } from '../db';
import { clientOver, json, type Wire } from './fake-db';

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

export type Recorded = { table: string; op: 'upsert' | 'insert' | 'update' | 'delete'; row: Row };
export type FakeRpcs = Record<string, (args: Record<string, unknown>) => unknown>;

const NOT_FILTERS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/;

const unsupported = (what: string): never => {
  throw new Error(`memoryDb does not read ${what}; add it here, in the one test database fake, with a test.`);
};

function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '(' || char === '{')) depth += 1;
    else if (!quoted && (char === ')' || char === '}')) depth -= 1;
    else if (!quoted && depth === 0 && char === ',') {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const unquote = (text: string) => (text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1).replace(/\\(.)/g, '$1') : text);
const listOf = (text: string) => splitTop(text.slice(1, -1)).map(unquote);

/** How a column value orders against the text a filter carries, by the column's own type. */
function compareTo(value: unknown, text: string): number {
  if (typeof value === 'number') return value - Number(text);
  if (typeof value === 'string' && DATE_LIKE.test(value) && DATE_LIKE.test(text)) return Date.parse(value) - Date.parse(text);
  return String(value) < text ? -1 : String(value) > text ? 1 : 0;
}

function likePattern(pattern: string, flags: string): RegExp {
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const source = pattern.replace(/\\(.)|[%*_]|[^\\%*_]+/g, (token: string, escaped: string | undefined) =>
    escaped !== undefined ? literal(escaped) : token === '%' || token === '*' ? '.*' : token === '_' ? '.' : literal(token),
  );
  return new RegExp(`^${source}$`, `s${flags}`);
}

function contains(value: unknown, wanted: string): boolean {
  if (Array.isArray(value)) return listOf(wanted).every((item) => value.some((have) => String(have) === item));
  if (typeof value === 'object' && value !== null) {
    const expected: unknown = JSON.parse(wanted);
    return typeof expected === 'object' && expected !== null && Object.entries(expected).every(([key, item]) => JSON.stringify((value as Row)[key]) === JSON.stringify(item));
  }
  return false;
}

function operator(column: string, op: string, text: string): Predicate {
  const at = (row: Row) => row[column] ?? null;
  const present = (test: (value: NonNullable<unknown>) => boolean): Predicate => (row) => {
    const value = at(row);
    return value !== null && test(value);
  };
  switch (op) {
    case 'eq':
      return present((value) => (typeof value === 'object' ? JSON.stringify(value) : String(value)) === text);
    case 'neq':
      return present((value) => String(value) !== text);
    case 'gt':
      return present((value) => compareTo(value, text) > 0);
    case 'gte':
      return present((value) => compareTo(value, text) >= 0);
    case 'lt':
      return present((value) => compareTo(value, text) < 0);
    case 'lte':
      return present((value) => compareTo(value, text) <= 0);
    case 'like':
      return present((value) => likePattern(text, '').test(String(value)));
    case 'ilike':
      return present((value) => likePattern(text, 'i').test(String(value)));
    case 'is':
      return (row) => String(at(row)) === text;
    case 'in': {
      const wanted = listOf(text);
      return present((value) => wanted.includes(String(value)));
    }
    case 'cs':
      return (row) => contains(at(row), text);
    case 'ov': {
      const wanted = listOf(text);
      return (row) => {
        const value = at(row);
        return Array.isArray(value) && value.some((have) => wanted.includes(String(have)));
      };
    }
    default:
      return unsupported(`the filter ${op}`);
  }
}

/** `eq.5`, `not.is.null`, or inside `or=(…)`: `col.eq.5`, `and(a.eq.1,b.eq.2)`. */
function condition(column: string, spec: string): Predicate {
  if (spec.startsWith('not.')) {
    const inner = condition(column, spec.slice(4));
    return (row) => !inner(row);
  }
  const dot = spec.indexOf('.');
  return operator(column, spec.slice(0, dot), spec.slice(dot + 1));
}

function group(mode: 'and' | 'or', body: string): Predicate {
  const parts = splitTop(body.slice(1, -1)).map((part): Predicate => {
    const nested = /^(and|or)(\(.*\))$/s.exec(part);
    if (nested !== null) return group(nested[1] === 'and' ? 'and' : 'or', nested[2] ?? '()');
    const dot = part.indexOf('.');
    return condition(part.slice(0, dot), part.slice(dot + 1));
  });
  return (row) => (mode === 'and' ? parts.every((part) => part(row)) : parts.some((part) => part(row)));
}

function filtersOf(url: URL): Predicate[] {
  return [...url.searchParams].filter(([key]) => !NOT_FILTERS.has(key)).map(([key, value]) => (key === 'or' || key === 'and' ? group(key, value) : condition(key, value)));
}

let schema: Map<string, Set<string>> | undefined;

/** The columns of each table and view, read from the generated database types, so a fixture row that leaves a nullable column out still has it. */
function columnsByTable(): Map<string, Set<string>> {
  if (schema !== undefined) return schema;
  const text = readFileSync(new URL('../../../db/src/database.types.ts', import.meta.url), 'utf8');
  schema = new Map();
  for (const [, table = '', body = ''] of text.matchAll(/^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm)) {
    schema.set(table, new Set([...body.matchAll(/^ {10}(\w+)\??:/gm)].map((match) => match[1] ?? '')));
  }
  return schema;
}

/** A column the table does not have is a typo or a missing migration; Postgres answers 42703, never an empty list. A table the generated types do not know (a test's own) has the columns its rows carry. */
function requireColumns(table: string, all: Row[], columns: string[]): void {
  const known = columnsByTable().get(table) ?? new Set(all.flatMap((row) => Object.keys(row)));
  if (known.size === 0) return;
  const missing = columns.find((column) => !known.has(column));
  if (missing !== undefined) throw new Error(`column ${table}.${missing} does not exist`);
}

const SELECT_SYNTAX = /[(:!]/;

/** The plain column names a request reads: the select list, each top-level filter and each order key. */
function columnsRead(url: URL): string[] {
  const select = url.searchParams.get('select');
  const listed = select === null || select === '*' ? [] : select.split(',').map((column) => column.trim()).filter((column) => column !== '*');
  const filtered = [...url.searchParams.keys()].filter((key) => !NOT_FILTERS.has(key) && key !== 'or' && key !== 'and');
  const ordered = (url.searchParams.get('order') ?? '').split(',').filter((key) => key !== '').map((key) => key.split('.')[0] ?? '');
  return [...listed, ...filtered, ...ordered];
}

/** Postgres orders null last on `asc` and first on `desc` unless the request says otherwise. */
function sorter(url: URL): (a: Row, b: Row) => number {
  const keys = (url.searchParams.get('order') ?? '').split(',').filter((key) => key !== '').map((key) => key.split('.'));
  return (a, b) => {
    for (const [column = '', direction, nulls] of keys) {
      const descending = direction === 'desc';
      const [x, y] = [a[column] ?? null, b[column] ?? null];
      if (x === null || y === null) {
        if (x === y) continue;
        const nullsFirst = nulls === undefined ? descending : nulls === 'nullsfirst';
        return (x === null) === nullsFirst ? -1 : 1;
      }
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : compareTo(x, String(y));
      if (order !== 0) return descending ? -order : order;
    }
    return 0;
  };
}

const failure = (message: string, status = 400, code = 'XX000') => json({ message, details: null, hint: null, code }, status);
const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

/**
 * A PostgREST that keeps `tables` in memory and answers the real supabase-js client, so a test runs the exact request the
 * code sends: filters (`eq`, `in`, `is`, `like` with `\\` escapes, `or=(…)`, `not.`), ordering with Postgres' null rules,
 * `limit` and `range`, counts and `head`, `single`, updates and deletes that change the rows in place, upserts that honour
 * `on_conflict` and ignore-duplicates, and Storage downloads from `files`. A write to a table named in `refuse` answers that
 * table's error message and changes nothing, as RLS or a lost connection would. `rpcs` answers database functions by name.
 */
export function memoryDb(tables: Record<string, Row[]>, writes: Recorded[] = [], files: Record<string, Uint8Array> = {}, refuse: Record<string, string> = {}, rpcs: FakeRpcs = {}): Db {
  const handle = (wire: Wire): Response => {
    try {
      return answer(wire);
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error), 501);
    }
  };
  const answer = (wire: Wire): Response => {
    const { method, url, headers } = wire;
    if (url.pathname.startsWith('/storage/v1/object/')) return download(files, decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length)));
    const name = url.pathname.replace('/rest/v1/', '');
    if (name.startsWith('rpc/')) return call(rpcs, name.slice(4), method === 'GET' ? Object.fromEntries(url.searchParams) : wire.text === '' ? {} : (JSON.parse(wire.text) as Record<string, unknown>));
    const all = (tables[name] ??= []);
    if (SELECT_SYNTAX.test(url.searchParams.get('select') ?? '')) unsupported('an embedded, aliased or hinted select');
    requireColumns(name, all, columnsRead(url));
    const prefer = headers.get('Prefer') ?? '';
    const wantsRows = prefer.includes('return=representation');
    const matching = () => all.filter((row) => filtersOf(url).every((test) => test(row))).toSorted(sorter(url));
    if (method !== 'GET' && method !== 'HEAD' && refuse[name] !== undefined) return failure(refuse[name]);
    if (method === 'PATCH') {
      const patch = JSON.parse(wire.text) as Row;
      const rows = matching();
      for (const row of rows) Object.assign(row, patch);
      writes.push({ table: name, op: 'update', row: patch });
      return wantsRows ? json(rows) : empty(204);
    }
    if (method === 'DELETE') {
      const rows = matching();
      for (const row of rows) all.splice(all.indexOf(row), 1);
      writes.push({ table: name, op: 'delete', row: deleted(url) });
      return wantsRows ? json(rows) : empty(204);
    }
    if (method === 'POST') return write(all, name, wire, writes);
    const rows = matching();
    const from = Number(url.searchParams.get('offset') ?? 0);
    const limit = url.searchParams.get('limit');
    const window = rows.slice(from, limit === null ? undefined : from + Number(limit));
    const range = rows.length === 0 ? `*/${rows.length}` : `${from}-${from + window.length - 1}/${rows.length}`;
    if (method === 'HEAD') return empty(200, { 'content-range': range });
    if (headers.get('Accept')?.includes('vnd.pgrst.object') === true && window.length !== 1) return failure('JSON object requested, multiple (or no) rows returned', 406, 'PGRST116');
    const shown = window.map((row) => project(row, url.searchParams.get('select')));
    const response = json(headers.get('Accept')?.includes('vnd.pgrst.object') === true ? shown[0] : shown);
    response.headers.set('content-range', range);
    return response;
  };
  return clientOver(handle);
}

/** Plain column lists narrow a row to those columns; `*` keeps the whole row. */
function project(row: Row, select: string | null): Row {
  if (select === null || select.includes('*')) return row;
  return Object.fromEntries(select.split(',').map((column) => column.trim()).filter((column) => column in row).map((column) => [column, row[column]]));
}

function write(all: Row[], table: string, wire: Wire, writes: Recorded[]): Response {
  const prefer = wire.headers.get('Prefer') ?? '';
  const upsert = prefer.includes('resolution=');
  const keys = wire.url.searchParams.get('on_conflict')?.split(',') ?? ['id'];
  const body: unknown = JSON.parse(wire.text);
  const touched: Row[] = [];
  for (const row of (Array.isArray(body) ? body : [body]) as Row[]) {
    writes.push({ table, op: upsert ? 'upsert' : 'insert', row });
    const existing = upsert ? all.find((other) => keys.every((key) => other[key] === row[key])) : undefined;
    if (existing === undefined) {
      const stored = upsert ? { id: `${table}-${all.length + 1}`, ...row } : { ...row };
      all.push(stored);
      touched.push(stored);
    } else if (!prefer.includes('ignore-duplicates')) {
      Object.assign(existing, row);
      touched.push(existing);
    }
  }
  return prefer.includes('return=representation') ? json(touched, 201) : empty(201);
}

const deleted = (url: URL): Row =>
  Object.fromEntries(
    [...url.searchParams]
      .filter(([key]) => !NOT_FILTERS.has(key))
      .map(([column, spec]) => [column, { [spec.slice(0, spec.indexOf('.'))]: spec.slice(spec.indexOf('.') + 1) }]),
  );

function call(rpcs: FakeRpcs, name: string, args: Record<string, unknown>): Response {
  const answer = rpcs[name];
  return answer === undefined ? failure(`no fake for ${name}`, 404, 'PGRST202') : json(answer(args) ?? null);
}

function download(files: Record<string, Uint8Array>, path: string): Response {
  const bytes = files[path];
  return bytes === undefined ? failure(`${path.slice(path.indexOf('/') + 1)} not found`, 404, 'not_found') : new Response(new Uint8Array(bytes));
}
