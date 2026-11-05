import type { Clock } from '../clock/clock';

export const EXPORT_SCHEMA_VERSION = 1;

export type ExportManifest = {
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly householdId: string;
  readonly tables: Readonly<Record<string, number>>;
  readonly files: number;
  /** Every ZIP of this export, in order; the manifest itself sits in the last one. */
  readonly parts: readonly string[];
};

export type ManifestInput = {
  readonly clock: Clock;
  readonly householdId: string;
  readonly counts: readonly { readonly table: string; readonly rows: number }[];
  readonly files: number;
  readonly parts: readonly string[];
};

export function buildManifest({ clock, householdId, counts, files, parts }: ManifestInput): ExportManifest {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: clock.now(),
    householdId,
    tables: Object.fromEntries(counts.map(({ table, rows }) => [table, rows])),
    files,
    parts: [...parts],
  };
}
