import { shortProvinceName } from '@esta/core/address';
import { PROPERTY_KINDS, type PropertyKind } from '@esta/core/properties';
import { z } from 'zod';
import type { AgentDb } from '../supabase';
import type { CitedRecord, RunSheet } from './fact-sheet';
import { ToolRejection } from './server';

const addressSchema = z.object({ commune_code: z.string(), province_code: z.string() });
const kindSchema = z.enum(PROPERTY_KINDS);

export type HeldProperty = {
  readonly id: string;
  readonly nickname: string;
  readonly kind: PropertyKind;
  readonly useMode: string;
  readonly legalStatus: string;
  readonly communeCode: string | null;
  readonly provinceCode: string | null;
};

/** The household's live properties in code order, which every household seeded alike shares, so recorded handles replay (AGENT.md §8). */
export async function readHeldProperties(db: AgentDb, householdId: string): Promise<HeldProperty[]> {
  const { data, error } = await db
    .from('properties')
    .select('id, nickname, kind, use_mode, legal_status, current_address')
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('code');
  if (error) throw new Error(`Reading the properties failed: ${error.message}`);
  return data.map((row) => {
    const address = addressSchema.safeParse(row.current_address);
    return {
      id: row.id,
      nickname: row.nickname,
      kind: kindSchema.parse(row.kind),
      useMode: row.use_mode,
      legalStatus: row.legal_status,
      communeCode: address.success ? address.data.commune_code : null,
      provinceCode: address.success ? address.data.province_code : null,
    };
  });
}

export async function adminUnitNames(db: AgentDb, codes: readonly string[]): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const { data, error } = await db.from('admin_units').select('code, name').in('code', [...new Set(codes)]);
  if (error) throw new Error(`Reading the administrative units failed: ${error.message}`);
  return new Map(data.map((row) => [row.code, row.name]));
}

export type PropertyRecord = {
  readonly id: string;
  readonly property_label: string;
  readonly kind: string;
  readonly use_mode: string;
  readonly legal_status: string;
  readonly commune_name: string | null;
  readonly province_name: string | null;
};

/** `list_properties` (AGENT.md §4). */
export function listPropertiesTool(db: AgentDb, householdId: string, cite: RunSheet['cite']) {
  const records = new Map<string, CitedRecord<PropertyRecord>>();
  let listed: Array<CitedRecord<PropertyRecord>> | undefined;
  return {
    records: records as ReadonlyMap<string, CitedRecord<PropertyRecord>>,
    async run() {
      if (listed === undefined) {
        const held = await readHeldProperties(db, householdId);
        const names = await adminUnitNames(db, held.flatMap((property) => [property.communeCode, property.provinceCode].filter((code) => code !== null)));
        const nameOf = (code: string | null) => (code === null ? null : (names.get(code) ?? null));
        listed = held.map((property) => {
          const province = nameOf(property.provinceCode);
          const record = cite({
            id: property.id,
            property_label: property.nickname,
            kind: property.kind,
            use_mode: property.useMode,
            legal_status: property.legalStatus,
            commune_name: nameOf(property.communeCode),
            province_name: province === null ? null : shortProvinceName(province),
          });
          records.set(record.handle, record);
          return record;
        });
      }
      return { properties: listed };
    },
  };
}

export type PropertyHandles = ReadonlyMap<string, CitedRecord<PropertyRecord>>;

/** The property a tool's `property` input names by its list_properties handle. */
export function propertyByHandle(properties: PropertyHandles, handle: string): CitedRecord<PropertyRecord> {
  const property = properties.get(handle);
  if (property === undefined) throw new ToolRejection(`property: ${handle} is not a property list_properties returned in this run`);
  return property;
}
