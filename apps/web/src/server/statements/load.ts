import 'server-only';
import { MAX_AMOUNT_VND, vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import type { ColumnPreset } from '@esta/core/matching';
import { idSchema, statementColumnsSchema } from '@esta/ops';
import { z } from 'zod';
import { LINE_REASONS, LINE_STATUSES, type BillLabel, type RefusedLine, type StatementLine } from '@/lib/statements/lines';
import { createSessionClient } from '@/server/supabase/server';

export type StatementImportView = {
  readonly id: string;
  readonly fileName: string;
  readonly committed: boolean;
  readonly accountId: string;
  readonly refused: readonly RefusedLine[];
  readonly lines: readonly StatementLine[];
};

const PAGE_SIZE = 1000;

const money = z.number().int().min(-MAX_AMOUNT_VND).max(MAX_AMOUNT_VND).transform(vnd);

const lineSchema = z.object({
  id: idSchema,
  row_index: z.number().int(),
  posted_on: isoDateSchema,
  amount_vnd: money,
  description: z.string(),
  bank_ref: z.string(),
  state: z.enum(LINE_STATUSES),
  reason: z.enum(LINE_REASONS).nullable(),
  invoice_id: idSchema.nullable(),
  candidate_invoice_ids: z.array(idSchema),
  hand_payments: z.array(z.object({ payment_id: idSchema, received_on: isoDateSchema, amount_vnd: money, bills: z.array(z.string()) })),
});

const importSchema = z.object({
  id: idSchema,
  file_name: z.string(),
  status: z.enum(['parsed', 'committed']),
  bank_account_id: idSchema,
  rejected: z.array(z.object({ index: z.number().int(), field: z.enum(['row', 'date', 'amount']), reason: z.string() })),
  column_mapping: z.object({ headerRow: z.number().int().min(0) }),
});

const billSchema = z
  .object({
    id: idSchema,
    number: z.string(),
    lease: z.object({ unit: z.object({ label: z.string(), kind: z.string(), property: z.object({ nickname: z.string() }) }) }),
  })
  .transform(
    (row): BillLabel => ({ id: row.id, number: row.number, unitLabel: row.lease.unit.label, wholeUnit: row.lease.unit.kind === 'whole', propertyName: row.lease.unit.property.nickname }),
  );

async function billLabels(householdId: string, ids: readonly string[]): Promise<Map<string, BillLabel>> {
  if (ids.length === 0) return new Map();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, number, lease:leases!invoices_household_id_lease_id_fkey(unit:units!leases_household_id_property_id_unit_id_fkey(label, kind, property:properties!units_household_id_property_id_fkey(nickname)))',
    )
    .eq('household_id', householdId)
    .in('id', [...ids]);
  if (error) throw new Error(`Reading the statement's bills failed: ${error.message}`);
  return new Map(z.array(billSchema).parse(data).map((bill) => [bill.id, bill]));
}

/** One import with every line in file order and the bills they name; null for an import the member cannot read. */
export async function loadStatementImport(householdId: string, importId: string): Promise<StatementImportView | null> {
  const supabase = await createSessionClient();
  const header = await supabase.from('statement_imports').select('id, file_name, status, bank_account_id, rejected, column_mapping').eq('household_id', householdId).eq('id', importId).maybeSingle();
  if (header.error) throw new Error(`Reading the import failed: ${header.error.message}`);
  if (header.data === null) return null;
  const stored = importSchema.parse(header.data);
  const rows: z.output<typeof lineSchema>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.rpc('statement_import_lines', { p_import_id: importId }).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading the import's lines failed: ${error.message}`);
    rows.push(...z.array(lineSchema).parse(data));
    if (data.length < PAGE_SIZE) break;
  }
  const named = (row: z.output<typeof lineSchema>) => (row.invoice_id === null ? row.candidate_invoice_ids : [row.invoice_id]);
  const bills = await billLabels(householdId, [...new Set(rows.flatMap(named))]);
  // A line is numbered from the header, so the first line under it is 1 whatever account lines the bank prints above.
  const fromHeader = (index: number) => index - stored.column_mapping.headerRow;
  return {
    id: stored.id,
    fileName: stored.file_name,
    committed: stored.status === 'committed',
    accountId: stored.bank_account_id,
    refused: stored.rejected.map((line) => ({ ...line, index: fromHeader(line.index) })),
    lines: rows.map((row) => ({
      id: row.id,
      index: fromHeader(row.row_index),
      date: row.posted_on,
      amount: row.amount_vnd,
      description: row.description,
      bankRef: row.bank_ref,
      status: row.state,
      reason: row.reason,
      bills: named(row).flatMap((id) => bills.get(id) ?? []),
      hands: row.hand_payments.map((hand) => ({ paymentId: hand.payment_id, receivedOn: hand.received_on, amount: hand.amount_vnd, bills: hand.bills })),
    })),
  };
}

/**
 * Each receiving account's saved columns (LSE-8 preset, P3-21): the columns of its latest import that committed or
 * whose columns a person chose. A file from that account whose labels Esta does not know is read under them when its
 * header still carries their labels. No migration: every import stores the columns it was read under.
 */
export async function loadColumnPresets(householdId: string, accountIds: readonly string[]): Promise<Readonly<Record<string, ColumnPreset>>> {
  const supabase = await createSessionClient();
  const latest = await Promise.all(
    accountIds.map(async (accountId) => {
      const { data, error } = await supabase
        .from('statement_imports')
        .select('column_mapping')
        .eq('household_id', householdId)
        .eq('bank_account_id', accountId)
        .or('status.eq.committed,column_mapping->>source.eq.mapped')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Reading the saved columns failed: ${error.message}`);
      const stored = data === null ? null : statementColumnsSchema.safeParse(data.column_mapping);
      return stored?.success ? ([[accountId, stored.data]] as const) : [];
    }),
  );
  return Object.fromEntries(latest.flat());
}
