import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../../packages/core/src/parse/csv.ts';
import { deriveResearchTopics, type LegacyUnit } from '../../../packages/core/src/research/index.ts';
import { publicTable } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import { propertyId } from './units.ts';

const csvRows = (file: string): string[][] =>
  parseCsv(readFileSync(join(import.meta.dirname, '..', 'reference', file), 'utf8'), { spanLines: true })
    .slice(1)
    .flatMap((row) => (row.ok ? [row.value] : []));

let reference: { readonly adminUnits: ReadonlyMap<string, string>; readonly legacy: readonly LegacyUnit[] } | undefined;

/** The reference data the migration loads, read from the same CSVs, so seeded topics equal what the worker derives. */
function referenceUnits() {
  reference ??= {
    adminUnits: new Map(csvRows('admin_units.csv').map(([code = '', name = '']) => [code, name])),
    legacy: csvRows('admin_unit_legacy_map.csv').map(([, oldProvinceName = '', , oldDistrictName = '', , , newCommuneCode = '', mergeKind]) => ({ newCommuneCode, oldProvinceName, oldDistrictName, whole: mergeKind === 'whole' })),
  };
  return reference;
}

export const researchTopics = publicTable('research_topics', ({ household, properties }) => {
  const { adminUnits, legacy } = referenceUnits();
  const held = properties.map((seed) => ({ id: propertyId(household, seed.key), kind: seed.kind, provinceCode: seed.address.province_code, communeCode: seed.address.commune_code }));
  return deriveResearchTopics(held, adminUnits, legacy).map((topic) => ({
    id: seedId(`seed:research-topic:${household.key}:${topic.key}`),
    household_id: householdId(household),
    topic_key: topic.key,
    label: topic.label,
    query_templates: [...topic.query_templates],
    province_codes: [...topic.province_codes],
    property_ids: [...topic.property_ids],
    source: topic.source,
  }));
});
