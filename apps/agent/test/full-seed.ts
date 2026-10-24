import { clockAt, parseInstant } from '@esta/core';
import { watchSnapshotSchema, type WatchLabels } from '@esta/core/watch';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The full seed's demo household on SPEC §9.3's day, as the watch reads it (AGENT.md §7). */
export const ROOT = join(import.meta.dirname, '../../..');
export const snapshot = watchSnapshotSchema.parse(JSON.parse(readFileSync(join(ROOT, 'packages/core/src/watch/fixtures/full-2026-10-07.snapshot.json'), 'utf8')));
const rawLabels = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/full-2026-10-07.labels.json'), 'utf8')) as Record<keyof WatchLabels, Record<string, never>>;
export const labels: WatchLabels = {
  properties: new Map(Object.entries(rawLabels.properties)),
  units: new Map(Object.entries(rawLabels.units)),
  parties: new Map(Object.entries(rawLabels.parties)),
  documents: new Map(Object.entries(rawLabels.documents)),
};
export const HOUSEHOLD = snapshot.householdId;
export const CASES = join(ROOT, 'fixtures/agent-replay-cases');

export const clockOn = (iso: string) => () => Promise.resolve(clockAt({ kind: 'table', now: parseInstant(iso) }, 'Asia/Ho_Chi_Minh'));

/** A row for each record of the household that an `esta://` link may name, so a link check finds exactly the seed's records. */
export function seedRecords(): Record<string, Array<Record<string, unknown>>> {
  const rows = (ids: Iterable<string>) => [...ids].map((id) => ({ id, household_id: HOUSEHOLD }));
  return {
    properties: rows(labels.properties.keys()),
    units: rows(labels.units.keys()),
    parties: rows(labels.parties.keys()),
    documents: rows(labels.documents.keys()),
    invoices: rows(snapshot.invoices.map((invoice) => invoice.id)),
    leases: rows(snapshot.leases.map((lease) => lease.id)),
    meters: rows(snapshot.meters.map((meter) => meter.id)),
  };
}
