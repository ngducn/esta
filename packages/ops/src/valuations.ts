import { valuationSchema, type Valuation } from '@esta/core/valuations';
import type { Db } from './db';
import { readAll } from './kit';

export async function readValuations(db: Db, householdId: string, propertyId: string | null = null): Promise<Valuation[]> {
  const rows = await readAll('valuations', (from, to) => {
    const query = db
      .from('valuations')
      .select('id, property_id, as_of, value_vnd, method, source_url, note, property:properties!inner()')
      .eq('household_id', householdId)
      .is('property.deleted_at', null);
    return (propertyId === null ? query : query.eq('property_id', propertyId))
      .order('as_of', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to);
  });
  return rows.map((row) =>
    valuationSchema.parse({
      id: row.id,
      propertyId: row.property_id,
      asOf: row.as_of,
      valueVnd: row.value_vnd,
      method: row.method,
      sourceUrl: row.source_url,
      note: row.note,
    }),
  );
}

export async function readLivePropertyIds(db: Db, householdId: string): Promise<string[]> {
  const { data, error } = await db.from('properties').select('id').eq('household_id', householdId).is('deleted_at', null);
  if (error) throw new Error(`Reading the properties failed: ${error.message}`);
  return data.map((row) => row.id);
}
