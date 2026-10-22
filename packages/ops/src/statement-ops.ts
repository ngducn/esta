import { planImport, type ImportInvoice, type ImportRow, type StoredLine } from '@esta/core/matching';
import { vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { dbRefusal, idSchema, readAll, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

const MAX_ROWS = 5000;

const lineIndex = z.number().int().min(0).max(100_000);
const columnIndex = z.number().int().min(0).max(99);

/** The header the rows were read under: the next file from the same account whose labels Esta does not know looks for these cells (P3-21). */
export const statementColumnsSchema = z.strictObject({
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
  column_mapping: statementColumnsSchema,
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

const storedLineSchema = z.object({
  fingerprint: z.string(),
  import_id: z.uuid(),
  posted_on: isoDateSchema,
  amount_vnd: z.number().int().transform(vnd),
  bank_ref: z.string(),
  description: z.string(),
});

/** Every line the household's imports hold, with whether it came into `accountId`, for core's `knownLines`. */
async function readStoredLines(ctx: OpContext, accountId: string): Promise<StoredLine[]> {
  const [rows, imports] = await Promise.all([
    readAll('the imported lines', (from, to) =>
      ctx.db.from('statement_rows').select('fingerprint, import_id, posted_on, amount_vnd, bank_ref, description').eq('household_id', ctx.householdId).order('id').range(from, to),
    ),
    readAll('the imports', (from, to) => ctx.db.from('statement_imports').select('id, bank_account_id').eq('household_id', ctx.householdId).order('id').range(from, to)),
  ]);
  const accountOf = new Map(imports.map((stored) => [stored.id, stored.bank_account_id]));
  return z
    .array(storedLineSchema)
    .parse(rows)
    .map((row) => ({
      fingerprint: row.fingerprint,
      importId: row.import_id,
      date: row.posted_on,
      amount: row.amount_vnd,
      bankRef: row.bank_ref,
      description: row.description,
      sameAccount: accountOf.get(row.import_id) === accountId,
    }));
}

/**
 * LSE-8 `Xem trước`: the decoded lines of a statement, matched to the household's bills and stored for preview. A
 * line dated after the Clock's date is refused, since only a received transfer can post. Lines an earlier import
 * holds, by core's `knownLines`, are left out; a file with nothing new names the import that holds it.
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
    const [invoices, stored] = await Promise.all([readImportInvoices(ctx), readStoredLines(ctx, input.bank_account_id)]);
    const planned = planImport(
      input.rows.filter((row) => row.date <= today),
      invoices,
      stored,
    );
    const [first] = planned.known;
    if (planned.rows.length === 0 && first !== undefined) return refuse({ kind: 'nothing_new', import_id: first });
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

const lineStateSchema = z.object({
  id: z.uuid(),
  state: z.string(),
  hand_payments: z.array(z.object({ payment_id: z.uuid() }).loose()),
});

/** Each line of the import with what it can do now, as the database reads it (`statement_line_state`). */
async function readLineStates(ctx: OpContext, importId: string): Promise<z.output<typeof lineStateSchema>[]> {
  const rows = await readAll("the import's lines", (from, to) => ctx.db.rpc('statement_import_lines', { p_import_id: importId }).select('id, state, hand_payments').range(from, to));
  return z.array(lineStateSchema).parse(rows);
}

/**
 * LSE-8 `Ghi sổ`: every memo match the database does not hold, and every suggestion or held line confirmed, posts as a
 * bank transfer in one transaction. A commit with nothing left to post plans as unchanged.
 */
export const statementCommit = defineOp<Commit, Commit, StatementCommitted>({
  creates: null,
  input: commitInputSchema,
  async plan(ctx, input) {
    const imported = await ctx.db.from('statement_imports').select('id').eq('household_id', ctx.householdId).eq('id', input.import_id).maybeSingle();
    if (imported.error) throw new Error(`Reading the import failed: ${imported.error.message}`);
    if (imported.data === null) return refuse({ kind: 'not_found' });
    const confirmed = new Set(input.confirmed_row_ids);
    const posts = (await readLineStates(ctx, input.import_id)).some(
      (line) => line.state === 'memo_match' || (confirmed.has(line.id) && (line.state === 'suggested' || line.state === 'held')),
    );
    return posts ? change(input) : unchanged({ posted: 0, skipped: 0 });
  },
  async apply(ctx, { import_id, confirmed_row_ids }) {
    const { data, error } = await ctx.db.rpc('commit_statement_import', { p_import_id: import_id, p_confirmed_row_ids: confirmed_row_ids });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    const [row] = data;
    return { ok: true, value: { posted: row?.posted_count ?? 0, skipped: row?.skipped_count ?? 0 } };
  },
});

const linkInputSchema = z.strictObject({ import_id: idSchema, row_id: idSchema, payment_id: idSchema });
type Link = z.output<typeof linkInputSchema>;

/** The payment is not one of the hand transfers the held line may be, or another line already holds it. */
export type LinkRefusal = { readonly kind: 'not_linkable' };

const LINK_SENTINELS: Readonly<Record<string, LinkRefusal | CommonRefusal>> = {
  ESTA_STATEMENT_LINE_NOT_FOUND: { kind: 'not_found' },
  ESTA_STATEMENT_LINE_NOT_LINKABLE: { kind: 'not_linkable' },
};

/**
 * LSE-8 `Đã ghi tay` ([app rule] DOMAIN-VN §9): a held line is the hand transfer the admin chose among its candidates,
 * so that payment takes the line and no money is added. A line already linked to it plans as unchanged.
 */
export const statementLink = defineOp<Link, Link, StatementCommitted, LinkRefusal>({
  creates: null,
  input: linkInputSchema,
  async plan(ctx, input) {
    const line = (await readLineStates(ctx, input.import_id)).find((candidate) => candidate.id === input.row_id);
    if (line === undefined) return refuse({ kind: 'not_found' });
    if (line.state === 'posted') {
      const linked = await ctx.db.from('payments').select('id').eq('id', input.payment_id).eq('statement_row_id', input.row_id).maybeSingle();
      if (linked.error) throw new Error(`Reading the linked payment failed: ${linked.error.message}`);
      return linked.data === null ? refuse({ kind: 'not_linkable' }) : unchanged({ posted: 0, skipped: 0 });
    }
    const offered = line.state === 'held' && line.hand_payments.some((hand) => hand.payment_id === input.payment_id);
    return offered ? change(input) : refuse({ kind: 'not_linkable' });
  },
  async apply(ctx, { row_id, payment_id }) {
    const { error } = await ctx.db.rpc('link_statement_line', { p_row_id: row_id, p_payment_id: payment_id });
    return error ? refuse(dbRefusal(error, LINK_SENTINELS)) : { ok: true, value: { posted: 0, skipped: 0 } };
  },
});
