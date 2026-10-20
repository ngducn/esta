import { planImport, type ImportInvoice, type ImportRow } from '@esta/core/matching';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

const lineIndex = z.number().int().min(0).max(100_000);
const columnIndex = z.number().int().min(0).max(99);

/** The header the rows were read under: the next import from the same account looks for these cells. */
const columnMappingSchema = z.strictObject({
  headerRow: z.number().int().min(0).max(19),
  header: z.array(z.string().max(200)).max(100),
  mapping: z.strictObject({
    date: columnIndex,
    description: columnIndex,
    bankRef: columnIndex.nullable(),
    amount: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('signed'), amount: columnIndex }),
      z.strictObject({ kind: z.literal('split'), credit: columnIndex, debit: columnIndex }),
    ]),
  }),
});

const rejectedSchema = z.strictObject({ index: lineIndex, field: z.enum(['row', 'date', 'amount']), reason: z.string().min(1).max(40) });
type Rejected = z.output<typeof rejectedSchema>;

const importInputSchema = z.strictObject({
  import_id: idSchema,
  bank_account_id: idSchema,
  file_name: z.string().trim().min(1).max(255),
  column_mapping: columnMappingSchema,
  rejected: z.array(rejectedSchema).max(MAX_ROWS),
  rows: z
    .array(
      z.strictObject({
        index: lineIndex,
        date: isoDateSchema,
        // A safe integer; statement_rows bounds it in SQL.
        amount: z.number().int().transform(vnd),
        description: z.string().max(1000),
        bankRef: z.string().max(200),
      }),
    )
    .min(1)
    .max(MAX_ROWS),
});
type ImportInput = z.output<typeof importInputSchema>;
type ImportChange = Omit<ImportInput, 'rows'> & { readonly rows: readonly ImportRow[]; readonly known: number };

/** The import to preview, and how many of the file's lines an earlier import already held. */
export type StatementImported = { readonly import_id: string; readonly known: number };
export type StatementCommitted = { readonly posted: number; readonly skipped: number };
/** Every line of the file is already in the import named, so nothing new would be stored. */
export type StatementRefusal = { readonly kind: 'nothing_new'; readonly import_id: string };

const SENTINELS: Readonly<Record<string, CommonRefusal>> = {
  ESTA_BANK_ACCOUNT_NOT_FOUND: { kind: 'not_found' },
  ESTA_IMPORT_NOT_FOUND: { kind: 'not_found' },
  ESTA_STATEMENT_ROWS: { kind: 'invalid', issues: [{ path: 'rows', code: 'invalid_value' }] },
};

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function readAll<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading ${what} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

const invoiceSchema = z.object({
  id: z.uuid(),
  memo_code: z.string(),
  status: z.enum(['issued', 'void']),
  due_date: isoDateSchema,
  lease: z.object({ tenant: z.object({ full_name: z.string() }).nullable() }),
});

/** Every issued and voided bill, with what each issued one still owes: paid ones too, so an overpayment by memo shows. */
async function readImportInvoices(ctx: OpContext): Promise<ImportInvoice[]> {
  const [bills, open] = await Promise.all([
    readAll('the bills', (from, to) =>
      ctx.db
        .from('invoices')
        .select('id, memo_code, status, due_date, lease:leases!invoices_household_id_lease_id_fkey(tenant:parties!leases_household_id_tenant_party_id_fkey(full_name))')
        .eq('household_id', ctx.householdId)
        .in('status', ['issued', 'void'])
        .order('id')
        .range(from, to),
    ),
    readAll('the open bills', (from, to) =>
      ctx.db.from('invoice_balances').select('id, outstanding_vnd').eq('household_id', ctx.householdId).eq('status', 'issued').gt('outstanding_vnd', 0).order('id').range(from, to),
    ),
  ]);
  const owed = new Map(open.map((row) => [row.id ?? '', row.outstanding_vnd ?? 0]));
  return z.array(invoiceSchema).parse(bills).map((bill) => ({
    id: bill.id,
    memoCode: bill.memo_code,
    status: bill.status,
    tenantName: bill.lease.tenant?.full_name ?? '',
    dueDate: bill.due_date,
    outstanding: vnd(owed.get(bill.id) ?? 0),
  }));
}

/** Each stored line's fingerprint, with the import that holds it. */
async function readKnownLines(ctx: OpContext): Promise<Map<string, string>> {
  const rows = await readAll('the imported lines', (from, to) =>
    ctx.db.from('statement_rows').select('fingerprint, import_id').eq('household_id', ctx.householdId).order('id').range(from, to),
  );
  return new Map(rows.map((row) => [row.fingerprint, row.import_id]));
}

/**
 * LSE-8 `Xem trước`: the decoded lines of a statement, matched to the household's bills and stored for preview. A
 * line dated after the Clock's date is refused, since only a received transfer can post. Lines an earlier import
 * holds are left out; a file with nothing new names the import that holds it.
 */
export const statementImport = defineOp<ImportInput, ImportChange, StatementImported, StatementRefusal>({
  creates: 'statement_imports',
  input: importInputSchema,
  async plan(ctx, input) {
    const existing = await ctx.db.from('statement_imports').select('id').eq('id', input.import_id).maybeSingle();
    if (existing.error) throw new Error(`Reading the import failed: ${existing.error.message}`);
    if (existing.data !== null) return unchanged({ import_id: input.import_id, known: 0 });
    const today = ctx.clock.today();
    const late: Rejected[] = input.rows.filter((row) => row.date > today).map((row) => ({ index: row.index, field: 'date', reason: 'after_today' }));
    const [invoices, known] = await Promise.all([readImportInvoices(ctx), readKnownLines(ctx)]);
    const planned = planImport(
      input.rows.filter((row) => row.date <= today),
      invoices,
      new Set(known.keys()),
    );
    const [first] = planned.known;
    if (planned.rows.length === 0 && first !== undefined) return refuse({ kind: 'nothing_new', import_id: known.get(first) ?? '' });
    return change({ ...input, rejected: [...input.rejected, ...late].toSorted((a, b) => a.index - b.index), rows: planned.rows, known: planned.known.length });
  },
  async apply(ctx, { import_id, bank_account_id, file_name, column_mapping, rejected, rows, known }) {
    const { error } = await ctx.db.rpc('create_statement_import', {
      p_import_id: import_id,
      p_bank_account_id: bank_account_id,
      p_file_name: file_name,
      p_column_mapping: column_mapping,
      p_rejected: rejected,
      p_rows: rows.map((stored) => ({
        row_index: stored.row.index,
        posted_on: stored.row.date,
        amount_vnd: stored.row.amount,
        description: stored.row.description,
        bank_ref: stored.row.bankRef,
        fingerprint: stored.fingerprint,
        status: stored.status,
        reason: stored.reason,
        invoice_id: stored.invoiceId,
        candidate_invoice_ids: [...stored.candidateIds],
      })),
    });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { import_id, known } };
  },
});

const commitInputSchema = z.strictObject({ import_id: idSchema, confirmed_row_ids: z.array(idSchema).max(MAX_ROWS) });
type Commit = z.output<typeof commitInputSchema>;

/**
 * LSE-8 `Ghi sổ` and `Xác nhận gợi ý`: every memo match, and the suggestions confirmed, post as bank transfers in one
 * transaction. A commit with nothing left to post plans as unchanged.
 */
export const statementCommit = defineOp<Commit, Commit, StatementCommitted>({
  creates: null,
  input: commitInputSchema,
  async plan(ctx, input) {
    const imported = await ctx.db.from('statement_imports').select('id').eq('household_id', ctx.householdId).eq('id', input.import_id).maybeSingle();
    if (imported.error) throw new Error(`Reading the import failed: ${imported.error.message}`);
    if (imported.data === null) return refuse({ kind: 'not_found' });
    const { data, error } = await ctx.db.from('statement_rows').select('id, status').eq('import_id', input.import_id).in('status', ['memo_match', 'suggested']);
    if (error) throw new Error(`Reading the import's lines failed: ${error.message}`);
    const confirmed = new Set(input.confirmed_row_ids);
    const posts = data.length >= PAGE_SIZE || data.some((row) => row.status === 'memo_match' || confirmed.has(row.id));
    return posts ? change(input) : unchanged({ posted: 0, skipped: 0 });
  },
  async apply(ctx, { import_id, confirmed_row_ids }) {
    const { data, error } = await ctx.db.rpc('commit_statement_import', { p_import_id: import_id, p_confirmed_row_ids: confirmed_row_ids });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    const [row] = data;
    return { ok: true, value: { posted: row?.posted_count ?? 0, skipped: row?.skipped_count ?? 0 } };
  },
});
