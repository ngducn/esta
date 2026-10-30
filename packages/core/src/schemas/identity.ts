/**
 * [app rule] The fields that tell one record from another (#356): a new record needs at least one of its kind's.
 * Only new records are checked, because the seeded paper-only parcel of Đất vườn Long An has none of the parcel's
 * (DOMAIN-VN §2).
 */
export const IDENTIFYING_FIELDS = {
  parcel: ['parcel_no', 'map_sheet_no', 'area_m2', 'origin_text'],
  certificate: ['serial_no', 'book_entry_no', 'issued_on', 'holder_party_ids'],
  utilityAccount: ['provider', 'customer_code', 'holder_name'],
  leaseDraft: ['tenant_party_id', 'start_date'],
} as const;

export type IdentifiedKind = keyof typeof IDENTIFYING_FIELDS;

/** The zod issue message of a new record with none of its identifying fields. */
export const UNIDENTIFIED = 'unidentified';

const present = (value: unknown) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0);

/** Whether a parsed record has any of its kind's identifying fields, for a schema's `refine` and a form's check. */
export function identifies<K extends IdentifiedKind>(kind: K): (record: Readonly<Record<(typeof IDENTIFYING_FIELDS)[K][number], unknown>>) => boolean {
  return (record) => IDENTIFYING_FIELDS[kind].some((field: (typeof IDENTIFYING_FIELDS)[K][number]) => present(record[field]));
}
