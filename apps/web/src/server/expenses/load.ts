import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { EXPENSE_CATEGORY_IDS, type ExpenseCategory } from '@esta/core/expenses';
import { vnd, type Vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

export type ExpenseRow = {
  readonly id: string;
  readonly category: ExpenseCategory;
  readonly amountVnd: Vnd;
  readonly paidOn: IsoDate;
  readonly vendor: { readonly id: string; readonly name: string } | null;
  readonly documentId: string | null;
  readonly note: string | null;
};

export type ExpenseVendorOption = { readonly id: string; readonly name: string };

const rowSchema = z.object({
  id: z.uuid(),
  category: z.enum(EXPENSE_CATEGORY_IDS),
  amount_vnd: z.number().int().positive().transform(vnd),
  paid_on: isoDateSchema,
  note: z.string().nullable(),
  document_id: z.uuid().nullable(),
  vendor: z.object({ id: z.uuid(), full_name: z.string() }).nullable(),
});

/** The tags of the parties the vendor picker offers: the people and firms an owner pays for work on a property. */
const VENDOR_TAGS = ['contractor', 'broker', 'other'];

/** Every live expense of the property, newest first; a property has tens a year, so the tab filters by year in memory. */
export async function loadPropertyExpenses(household: string, propertyId: string): Promise<readonly ExpenseRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('id, category, amount_vnd, paid_on, note, document_id, vendor:parties(id, full_name)')
    .eq('household_id', household)
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Reading the expenses failed: ${error.message}`);
  return z
    .array(rowSchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      category: row.category,
      amountVnd: row.amount_vnd,
      paidOn: row.paid_on,
      vendor: row.vendor === null ? null : { id: row.vendor.id, name: row.vendor.full_name },
      documentId: row.document_id,
      note: row.note,
    }));
}

export async function loadExpenseVendors(household: string): Promise<readonly ExpenseVendorOption[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('parties').select('id, full_name').eq('household_id', household).overlaps('tags', VENDOR_TAGS);
  if (error) throw new Error(`Reading the vendors failed: ${error.message}`);
  return data.map((party) => ({ id: party.id, name: party.full_name })).toSorted((a, b) => a.name.localeCompare(b.name, 'vi'));
}
