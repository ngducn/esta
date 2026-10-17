/**
 * Field paths whose exact match the AGENT.md §7.2 target counts. `[]` means every item of
 * the array, so a path's values are compared as a multiset across items. P2-03 adds the
 * utility bill and lease entries.
 */
export const REQUIRED_FIELDS = {
  certificate_v1: [
    'parcels[].parcel_no',
    'parcels[].map_sheet_no',
    'parcels[].area_m2',
    'parcels[].address_text',
    'holders[].full_name',
    'issued_on',
    'serial_no',
  ],
} as const satisfies Record<string, readonly string[]>;

export type SchemaName = keyof typeof REQUIRED_FIELDS;

export function isSchemaName(name: string): name is SchemaName {
  return Object.hasOwn(REQUIRED_FIELDS, name);
}
