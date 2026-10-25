import { ESTA_LINK_TABLES, estaUri, parseEstaUri, type EstaLinkType } from '@esta/core/links';
import type { Db } from './db';
import { readRows } from './kit';

/**
 * The `esta://` links among `links` that name a record of the household, by one read per type. The web reads through
 * the member's session, so RLS also hides what the member may not see; the worker reads through its service client.
 */
export async function existingLinks(db: Db, householdId: string, links: readonly string[]): Promise<ReadonlySet<string>> {
  const ids = new Map<EstaLinkType, string[]>();
  for (const link of links) {
    const route = parseEstaUri(link);
    if (route.ok) ids.set(route.value.type, [...(ids.get(route.value.type) ?? []), route.value.id]);
  }
  const found = await Promise.all(
    [...ids].map(async ([type, list]) => {
      const rows = await readRows(`the ${type} links`, db.from(ESTA_LINK_TABLES[type]).select('id').eq('household_id', householdId).in('id', list));
      return rows.map((row) => estaUri({ type, id: row.id }));
    }),
  );
  return new Set(found.flat());
}
