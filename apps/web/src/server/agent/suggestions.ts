import 'server-only';
import { noteRelated, noteSuggestion, suggestReplies, type Suggestion, type SuggestionLabels } from '@esta/core/assistant';
import { WATCH_SEVERITIES } from '@esta/core/watch';
import { z } from 'zod';
import { createSessionClient } from '@/server/supabase/server';
import { canonicalStamp } from './thread-cursor';

const UNIT = 'label, kind, property:properties!units_household_id_property_id_fkey(nickname)';
const LEASE = `tenant:parties!leases_household_id_tenant_party_id_fkey(full_name), unit:units!leases_household_id_property_id_unit_id_fkey(${UNIT})`;

const unitSchema = z.object({ label: z.string(), kind: z.string(), property: z.object({ nickname: z.string() }) });
const leaseSchema = z.object({ tenant: z.object({ full_name: z.string() }).nullable(), unit: unitSchema });
const noteSchema = z.object({ id: z.uuid(), kind: z.string(), severity: z.enum(WATCH_SEVERITIES), status: z.string(), created_at: z.string(), related: z.unknown() });

/** `{unit}, {property}` in the reader's language, as the collections board writes a place. */
type Place = (unit: string, property: string) => string;

const unitLabels = (unit: z.output<typeof unitSchema>, place: Place): SuggestionLabels => ({
  property: unit.property.nickname,
  unit: unit.kind === 'whole' ? unit.property.nickname : place(unit.label, unit.property.nickname),
});
const leaseLabels = (lease: z.output<typeof leaseSchema>, place: Place): SuggestionLabels => ({ ...unitLabels(lease.unit, place), ...(lease.tenant === null ? {} : { tenant: lease.tenant.full_name }) });

async function rows<T>(read: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T[]> {
  const { data, error } = await read;
  if (error) throw new Error(`Reading the suggested replies failed: ${error.message}`);
  return z.array(schema).parse(data);
}

/**
 * Up to three replies from the open notes RLS lets her read, of any day as Cần xử lý reads them [app rule]: the seeded
 * and the watch's notes date from the morning before. The names they hold come from the records each note's watch
 * fact names, read through RLS, never from the note's text (AGENT.md §5.6 step 8).
 */
export async function loadSuggestions(householdId: string, place: Place): Promise<Suggestion[]> {
  const db = await createSessionClient();
  const fetched = await rows(
    db.from('agent_items').select('id, kind, severity, status, created_at, related').eq('household_id', householdId).in('status', ['new', 'read']),
    noteSchema,
  );
  const notes = fetched.map((row) => {
    const related = noteRelated(row.related);
    return { ...row, related, subject: noteSuggestion(row.kind, related).subjectKey?.split(':') ?? [] };
  });
  const ids = (type: string) => notes.flatMap(({ subject: [kind, id] }) => (kind === type && id !== undefined ? [id] : []));
  const [invoices, leases, units] = await Promise.all([
    rows(db.from('invoices').select(`id, lease:leases!invoices_household_id_lease_id_fkey(${LEASE})`).in('id', ids('invoice')), z.object({ id: z.uuid(), lease: leaseSchema })),
    rows(db.from('leases').select(`id, ${LEASE}`).in('id', ids('lease')), leaseSchema.extend({ id: z.uuid() })),
    rows(db.from('units').select(`id, ${UNIT}`).in('id', ids('unit')), unitSchema.extend({ id: z.uuid() })),
  ]);
  const labels = new Map<string, SuggestionLabels>([
    ...invoices.map(({ id, lease }) => [`invoice:${id}`, leaseLabels(lease, place)] as const),
    ...leases.map((lease) => [`lease:${lease.id}`, leaseLabels(lease, place)] as const),
    ...units.map((unit) => [`unit:${unit.id}`, unitLabels(unit, place)] as const),
  ]);
  return suggestReplies(notes.map((note) => ({ ...note, stamp: canonicalStamp(note.created_at), labels: labels.get(note.subject.join(':')) ?? {} })));
}
