import type { Clock } from '@esta/core';
import { EXPORT_SCHEMA_VERSION, EXPORT_TABLES } from '@esta/core/export';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ExportSink } from './sink';
import { addObject, csvChunks, jsonChunks, objectsUnder, type Row } from './writeExport';

const IN_CHUNK = 40;
const PAGE_ROWS = 1000;
const encoder = new TextEncoder();
const pageSchema = z.array(z.record(z.string(), z.unknown()));

export type PartyExportOptions = { readonly clock: Clock };

export type WrittenPartyExport = {
  readonly documentIds: readonly string[];
  readonly tables: Readonly<Record<string, number>>;
  readonly files: number;
};

type Scope = { readonly column: string; readonly values: readonly string[] };

const idsOf = (rows: readonly Row[]) => rows.map((row) => String(row.id));
const union = (...lists: readonly (readonly Row[])[]) => [...new Map(lists.flat().map((row) => [String(row.id), row])).values()].toSorted((a, b) => String(a.id).localeCompare(String(b.id)));

/** Ids go in groups so the request line stays short. */
async function readWhere(client: SupabaseClient, householdId: string, tableName: string, scope: Scope): Promise<Row[]> {
  const table = EXPORT_TABLES.find((candidate) => candidate.name === tableName);
  if (table === undefined) throw new Error(`${tableName} is not an export table`);
  const rows: Row[] = [];
  for (let from = 0; from < scope.values.length; from += IN_CHUNK) {
    const chunk = scope.values.slice(from, from + IN_CHUNK);
    let after: string | undefined;
    for (;;) {
      const base = client.from(tableName).select(table.columns.join(',')).eq('household_id', householdId).in(scope.column, chunk);
      const { data, error } = await (after === undefined ? base : base.gt('id', after)).order('id').limit(PAGE_ROWS);
      if (error) throw new Error(`Reading ${tableName} failed: ${error.message}`);
      const page = pageSchema.parse(data);
      const last = page.at(-1)?.id;
      if (typeof last !== 'string') break;
      rows.push(...page);
      after = last;
    }
  }
  return rows;
}

async function* once(rows: Row[]): AsyncGenerator<Row[]> {
  if (rows.length > 0) yield rows;
}

const WITHHELD_COLUMNS: Readonly<Record<string, readonly string[]>> = { invoices: ['share_token'] };
const OTHER_PAYER_FIELDS = ['payer_party_id', 'memo', 'bank_ref', 'statement_row_id', 'idempotency_key'] as const;

const amountOf = (row: Row) => Number(row.amount_vnd);

/** A transfer someone else paid, whole or split across rooms, shows this person's share and date only, never the other payer or the bank's text. */
function paymentFor(payment: Row, shares: readonly Row[], partyId: string): Row {
  const mineSum = shares.filter((share) => share.mine === true).reduce((sum, share) => sum + amountOf(share), 0);
  if (payment.payer_party_id === partyId) return payment;
  const redacted: Row = { ...payment, amount_vnd: mineSum };
  for (const field of OTHER_PAYER_FIELDS) redacted[field] = null;
  return redacted;
}

/** Every write names this person's ids. Another tenant's allocations are read only to tell a split transfer, and none is written. */
export async function writePartyExport(client: SupabaseClient, householdId: string, partyId: string, sink: ExportSink, { clock }: PartyExportOptions): Promise<WrittenPartyExport> {
  const read = (table: string, scope: Scope) => readWhere(client, householdId, table, scope);
  const parties = await read('parties', { column: 'id', values: [partyId] });
  const leases = await read('leases', { column: 'tenant_party_id', values: [partyId] });
  const leaseIds = idsOf(leases);
  const invoices = await read('invoices', { column: 'lease_id', values: leaseIds });
  const invoiceIds = idsOf(invoices);
  const invoiceLines = await read('invoice_lines', { column: 'invoice_id', values: invoiceIds });
  const paid = await read('payments', { column: 'payer_party_id', values: [partyId] });
  const mineAllocations = await read('payment_allocations', { column: 'invoice_id', values: invoiceIds });
  const paymentIds = [...new Set([...idsOf(paid), ...mineAllocations.map((row) => String(row.payment_id))])];
  const everyAllocation = await read('payment_allocations', { column: 'payment_id', values: paymentIds });
  const mineIds = new Set(invoiceIds);
  const allocations = everyAllocation.filter((row) => mineIds.has(String(row.invoice_id)));
  const sharesOf = (paymentId: string) => everyAllocation.filter((row) => String(row.payment_id) === paymentId).map((row) => ({ ...row, mine: mineIds.has(String(row.invoice_id)) }));
  const payments = union(paid, await read('payments', { column: 'id', values: paymentIds })).map((payment) => paymentFor(payment, sharesOf(String(payment.id)), partyId));
  const depositEntries = await read('deposit_entries', { column: 'lease_id', values: leaseIds });
  const documents = union(await read('documents', { column: 'party_id', values: [partyId] }), await read('documents', { column: 'lease_id', values: leaseIds }));

  const written: Record<string, Row[]> = { parties, leases, invoices, invoice_lines: invoiceLines, payments, payment_allocations: allocations, deposit_entries: depositEntries, documents };
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(written)) {
    const withheld = WITHHELD_COLUMNS[name] ?? [];
    const columns = (EXPORT_TABLES.find((table) => table.name === name)?.columns ?? []).filter((column) => !withheld.includes(column));
    const shown = withheld.length === 0 ? rows : rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !withheld.includes(key))));
    await sink.add(`tables/${name}.json`, jsonChunks(once(shown), () => undefined));
    await sink.add(`tables/${name}.csv`, csvChunks(once(shown), columns));
    counts[name] = rows.length;
  }

  let files = 0;
  for (const document of documents) {
    for await (const object of objectsUnder(client, 'documents', `${householdId}/${String(document.id)}`)) {
      await addObject(client, sink, object);
      files += 1;
    }
  }

  await sink.finish((parts) =>
    encoder.encode(`${JSON.stringify({ schemaVersion: EXPORT_SCHEMA_VERSION, kind: 'party', exportedAt: clock.now(), householdId, partyId, tables: counts, files, parts }, null, 2)}\n`),
  );
  return { documentIds: idsOf(documents), tables: counts, files };
}
