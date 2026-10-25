import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { isoDateSchema } from '@esta/core/schemas/legal';
import type { TodayTask } from '@esta/core/today';
import { idSchema } from '@esta/ops';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';

const taskSchema = z.object({
  id: idSchema,
  title: z.string(),
  due_on: isoDateSchema.nullable(),
  property: z.object({ nickname: z.string(), deleted_at: z.string().nullable() }).nullable(),
});

/**
 * The household's open tasks by due date, undated last, read as the member, leaving out those of an archived property.
 * `dueBy` keeps those due on or before it, as Home's today list reads them.
 */
export async function loadOpenTasks(householdId: string, dueBy?: IsoDate): Promise<TodayTask[]> {
  const db = await createSessionClient();
  let query = db
    .from('tasks')
    .select('id, title, due_on, property:properties!tasks_household_id_property_id_fkey(nickname, deleted_at)')
    .eq('household_id', householdId)
    .eq('status', 'open');
  if (dueBy !== undefined) query = query.lte('due_on', dueBy);
  const { data, error } = await query.order('due_on', { ascending: true, nullsFirst: false }).order('created_at').order('id').limit(100);
  if (error) throw new Error(`Reading the open tasks failed: ${error.message}`);
  return z
    .array(taskSchema)
    .parse(data)
    .filter((row) => (row.property?.deleted_at ?? null) === null)
    .map((row) => ({ taskId: row.id, title: row.title, dueOn: row.due_on, propertyName: row.property?.nickname ?? null }));
}
