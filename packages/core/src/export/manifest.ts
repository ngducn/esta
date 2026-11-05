import type { Clock } from '../clock/clock';
import { withheldTables } from './tables';

export const EXPORT_SCHEMA_VERSION = 1;

export type ExportManifest = {
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly householdId: string;
  readonly tables: Readonly<Record<string, number>>;
  readonly files: number;
  /** Every ZIP of this export, in order; the manifest itself sits in the last one. */
  readonly parts: readonly string[];
  /** Who exported: the file holds what this session could read. */
  readonly exporter: ExportExporter;
  /** Always false: an export reads through one member's session, so it never claims to be the whole household. */
  readonly complete: false;
  /** The tables the exporter's session reads only in part, with the rule that narrows each. */
  readonly withheld: readonly { readonly table: string; readonly rule: string }[];
};

export type ExportExporter = { readonly role: string; readonly isOperator: boolean };

export type ManifestInput = {
  readonly clock: Clock;
  readonly householdId: string;
  readonly counts: readonly { readonly table: string; readonly rows: number }[];
  readonly files: number;
  readonly parts: readonly string[];
  readonly exporter: ExportExporter;
};

export function buildManifest({ clock, householdId, counts, files, parts, exporter }: ManifestInput): ExportManifest {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: clock.now(),
    householdId,
    tables: Object.fromEntries(counts.map(({ table, rows }) => [table, rows])),
    files,
    parts: [...parts],
    exporter,
    complete: false,
    withheld: withheldTables(exporter.isOperator),
  };
}
