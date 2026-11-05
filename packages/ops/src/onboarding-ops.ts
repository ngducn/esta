import { z } from 'zod';
import { dbRefusal } from './kit';
import { change, defineOp, refuse, unchanged } from './op';

const inputSchema = z.strictObject({ dismissed: z.boolean() });
const storedSchema = z.object({ dismissed_at: z.string().nullable().optional() });
type Input = z.output<typeof inputSchema>;
type Onboarding = { readonly dismissed_at?: string };
type Change = { readonly onboarding: Onboarding };
export type FirstRunDismissed = { readonly dismissed: boolean };

/** Hides the first-run checklist for the household, or shows it again: the stored object is `{ dismissed_at }` or `{}`. */
export const firstRunSetDismissed = defineOp<Input, Change, FirstRunDismissed>({
  creates: null,
  input: inputSchema,
  async plan(ctx, { dismissed }) {
    const { data, error } = await ctx.db.from('household_settings').select('onboarding').eq('household_id', ctx.householdId).maybeSingle();
    if (error) throw new Error(`Reading the household settings failed: ${error.message}`);
    if (data === null) return refuse({ kind: 'not_found' });
    const stored = storedSchema.safeParse(data.onboarding);
    const hidden = stored.success && typeof stored.data.dismissed_at === 'string';
    const empty = stored.success && Object.keys(stored.data).length === 0;
    if (dismissed ? hidden : empty) return unchanged({ dismissed });
    return change({ onboarding: dismissed ? { dismissed_at: ctx.clock.now() } : {} });
  },
  async apply(ctx, { onboarding }) {
    const { data, error } = await ctx.db.from('household_settings').update({ onboarding }).eq('household_id', ctx.householdId).select('id');
    if (error) return refuse(dbRefusal(error));
    return data.length > 0 ? { ok: true, value: { dismissed: onboarding.dismissed_at !== undefined } } : refuse({ kind: 'forbidden' });
  },
});
