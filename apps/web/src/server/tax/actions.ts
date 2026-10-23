'use server';

import type { Vnd } from '@esta/core/money';
import { parseVndInput } from '@esta/core/parse/vnd-input';
import type { Result } from '@esta/core/result';
import { runOp, taxInputSave } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { webOpContext } from '@/server/ops';

export type TaxSaveRefusal = 'empty' | 'invalid' | 'forbidden' | 'failed';

/** The amount stays text, so a value that does not read is refused, never saved as 0. */
const formSchema = z.object({ partyId: z.string(), year: z.number(), amount: z.string() });

/** FIN-3 `Doanh thu kinh doanh khác`: saves an owner's other business revenue for a year; the card redraws from it. */
export async function saveOtherBusinessRevenue(raw: z.input<typeof formSchema>): Promise<Result<Vnd, TaxSaveRefusal>> {
  const form = formSchema.safeParse(raw);
  if (!form.success) return { ok: false, reason: 'invalid' };
  const amount = parseVndInput(form.data.amount);
  if (!amount.ok) return { ok: false, reason: amount.reason === 'empty' ? 'empty' : 'invalid' };
  const result = await runOp(taxInputSave, await webOpContext(), { party_id: form.data.partyId, year: form.data.year, other_business_revenue_vnd: amount.value });
  if (!result.ok) return { ok: false, reason: result.reason.kind === 'forbidden' || result.reason.kind === 'invalid' ? result.reason.kind : 'failed' };
  revalidatePath('/reports/tax');
  return { ok: true, value: result.value.other_business_revenue_vnd };
}
