import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storagePath } from '../../../packages/core/src/documents/storage-path.ts';
import { planLeaseAcceptance } from '../../../packages/core/src/extraction/acceptance.ts';
import { reviewFields } from '../../../packages/core/src/extraction/fields.ts';
import { publicTable, type HouseholdSeed, type SeedContext } from './context.ts';
import { householdId, personKey } from './households.ts';
import { seedId, type SeedId } from './ids.ts';
import { seedLeaseId } from './leasing.ts';
import { quote } from './sql.ts';
import type { PropertySeedKey } from './properties.ts';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

type SeedFile = { readonly file: string; readonly mime: 'image/jpeg' | 'image/png' | 'application/pdf'; readonly pageCount: number; readonly preview: string };

const certificate = (fixture: string, page: string): SeedFile => {
  const file = `fixtures/certificates/${fixture}/${page}`;
  return { file, mime: 'image/jpeg', pageCount: 1, preview: file };
};

/**
 * Every seeded file, by the object name it is stored under. A certificate uses the P2-01 fixture of its row's form,
 * a different picture per property, so the duplicate warning fires only for a real re-upload. None is the
 * `gcn_2024-photo` page that a lane uploads to Long An, or the `gcn_2009_2024` scan that a lane drops on Bảo Lộc.
 */
export const SEED_DOCUMENT_FILES = {
  'so-hong-pre2009-photo-page-1.jpg': certificate('so_hong_pre2009-photo', 'page-1.jpg'),
  'gcn-2009-2024-low-light-page-1.jpg': certificate('gcn_2009_2024-low-light', 'page-1.jpg'),
  'gcn-2024-low-light-page-1.jpg': certificate('gcn_2024-low-light', 'page-1.jpg'),
  'gcn-2009-2024-low-light-page-2.jpg': certificate('gcn_2009_2024-low-light', 'page-2.jpg'),
  'so-do-pre2009-photo-page-1.jpg': certificate('so_do_pre2009-photo', 'page-1.jpg'),
  'gcn-2009-2024-photo-page-1.jpg': certificate('gcn_2009_2024-photo', 'page-1.jpg'),
  'bao-hiem-q7.pdf': { file: 'supabase/seed/documents/bao-hiem-q7.pdf', mime: 'application/pdf', pageCount: 1, preview: 'supabase/seed/documents/bao-hiem-q7.page-1.png' },
  'hop-dong-thue-thu-duc.pdf': {
    file: 'supabase/seed/documents/hop-dong-thue-thu-duc.pdf',
    mime: 'application/pdf',
    pageCount: 2,
    preview: 'supabase/seed/documents/hop-dong-thue-thu-duc.page-1.png',
  },
  'hop-dong-thue-di-an-phong-8.jpg': {
    file: 'fixtures/leases/lease-di-an-phong-8-photo/page-1.jpg',
    mime: 'image/jpeg',
    pageCount: 1,
    preview: 'fixtures/leases/lease-di-an-phong-8-photo/page-1.jpg',
  },
  'cccd-demo.png': { file: 'supabase/seed/documents/cccd-demo.png', mime: 'image/png', pageCount: 1, preview: 'supabase/seed/documents/cccd-demo.png' },
} as const satisfies Record<string, SeedFile>;

export type SeedDocumentName = keyof typeof SEED_DOCUMENT_FILES;

type DocumentSeed = {
  readonly key: string;
  readonly property: PropertySeedKey | null;
  readonly category: 'certificate' | 'insurance' | 'lease_contract' | 'id_card';
  readonly title: string;
  readonly name: SeedDocumentName;
  readonly expiresOn: string | null;
  /** The lease the paper belongs to, as `{property}:{unit}` (P3-08). */
  readonly lease?: { readonly property: PropertySeedKey; readonly unit: number };
};

/** SPEC §9.3 documents. `long-an` has a paper-only record and no certificate photo, so it stays below 60%. */
export const DOCUMENT_SEEDS: readonly DocumentSeed[] = [
  { key: 'q7:certificate', property: 'q7', category: 'certificate', title: 'Sổ hồng Q7', name: 'so-hong-pre2009-photo-page-1.jpg', expiresOn: null },
  { key: 'q7:insurance', property: 'q7', category: 'insurance', title: 'Bảo hiểm cháy nổ Nhà phố Q7', name: 'bao-hiem-q7.pdf', expiresOn: '2026-10-30' },
  { key: 'thu-duc:certificate', property: 'thu-duc', category: 'certificate', title: 'Sổ hồng Thủ Đức', name: 'gcn-2009-2024-low-light-page-1.jpg', expiresOn: null },
  {
    key: 'thu-duc:lease',
    property: 'thu-duc',
    category: 'lease_contract',
    title: 'Hợp đồng thuê Căn hộ Thủ Đức',
    name: 'hop-dong-thue-thu-duc.pdf',
    expiresOn: null,
    lease: { property: 'thu-duc', unit: 1 },
  },
  { key: 'di-an:certificate', property: 'di-an', category: 'certificate', title: 'Sổ hồng Dĩ An', name: 'gcn-2024-low-light-page-1.jpg', expiresOn: null },
  { key: 'di-an:lease-phong-8', property: 'di-an', category: 'lease_contract', title: 'Hợp đồng thuê Phòng 8 Dĩ An', name: 'hop-dong-thue-di-an-phong-8.jpg', expiresOn: null },
  { key: 'q1:certificate', property: 'q1', category: 'certificate', title: 'Sổ hồng Quận 1', name: 'gcn-2009-2024-low-light-page-2.jpg', expiresOn: null },
  { key: 'bien-hoa:certificate', property: 'bien-hoa', category: 'certificate', title: 'Sổ đỏ Biên Hòa', name: 'so-do-pre2009-photo-page-1.jpg', expiresOn: null },
  { key: 'bao-loc:certificate', property: 'bao-loc', category: 'certificate', title: 'Sổ hồng Bảo Lộc', name: 'gcn-2009-2024-photo-page-1.jpg', expiresOn: null },
  { key: 'id-card:me', property: null, category: 'id_card', title: 'CCCD Nguyễn Thị Demo', name: 'cccd-demo.png', expiresOn: null },
];

const SENSITIVE: ReadonlySet<DocumentSeed['category']> = new Set(['certificate', 'id_card']);

const digests = new Map<string, { sha256: string; size: number }>();
function digest(file: string) {
  const cached = digests.get(file);
  if (cached !== undefined) return cached;
  const bytes = readFileSync(join(repoRoot, file));
  const value = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  digests.set(file, value);
  return value;
}

export const documentId = (household: HouseholdSeed, key: string) => seedId(`seed:document:${household.key}:${key}`);

export const documents = publicTable('documents', ({ household, properties }) => {
  const present = new Set(properties.map(({ key }) => key));
  return DOCUMENT_SEEDS.filter((seed) => seed.property === null || present.has(seed.property)).map((seed) => {
    const id = documentId(household, seed.key);
    const source = SEED_DOCUMENT_FILES[seed.name];
    const { sha256, size } = digest(source.file);
    return {
      id,
      household_id: householdId(household),
      property_id: seed.property === null ? null : seedId(`seed:property:${household.key}:${seed.property}`),
      party_id: seed.category === 'id_card' ? seedId(`seed:party:${personKey('me', household)}`) : null,
      category: seed.category,
      title: seed.title,
      storage_path: storagePath(householdId(household), id, seed.name),
      mime: source.mime,
      size_bytes: size,
      page_count: source.pageCount,
      sha256,
      sensitivity: SENSITIVE.has(seed.category) ? 'sensitive' : 'normal',
      expires_on: seed.expiresOn,
      lease_id: seed.lease === undefined ? null : seedLeaseId(household, seed.lease),
    };
  });
});

const LEASE_READING: unknown = JSON.parse(readFileSync(join(repoRoot, 'fixtures/leases/lease-di-an-phong-8-photo/truth.json'), 'utf8')).lease;

/** Every field of the Phòng 8 contract's reading as Mẹ accepts it on review, built by the planner the review saves with. */
function acceptedReading(extraction: { id: string; householdId: string; propertyId: string; documentId: string }) {
  const decisions = Object.fromEntries(reviewFields('lease_v1', LEASE_READING).map((field) => [field.path, { kind: 'accepted' as const }]));
  const planned = planLeaseAcceptance({ ...extraction, result: LEASE_READING }, decisions);
  if (!planned.ok) throw new Error(`The seeded lease reading does not accept: ${planned.reason}`);
  return planned.plan.acceptedFields;
}

type ContractReading = { readonly id: SeedId; readonly householdId: string; readonly propertyId: string; readonly documentId: string };

function contractReadings({ household, properties }: Pick<SeedContext, 'household' | 'properties'>): ContractReading[] {
  if (!properties.some(({ key }) => key === 'di-an')) return [];
  return [
    {
      id: seedId(`seed:extraction:${household.key}:di-an:lease-phong-8`),
      householdId: householdId(household),
      propertyId: seedId(`seed:property:${household.key}:di-an`),
      documentId: documentId(household, 'di-an:lease-phong-8'),
    },
  ];
}

/** P3-19: the Phòng 8 contract's reading, queued here and walked to accepted by `contractReadingsSql`. */
export const documentExtractions = publicTable('document_extractions', (ctx) =>
  contractReadings(ctx).map((reading) => ({ id: reading.id, household_id: reading.householdId, document_id: reading.documentId, schema_name: 'lease_v1', schema_version: 1 })),
);

/**
 * The reading goes the way the worker and Mẹ take it, queued to running to needs_review to accepted, since the
 * database lets nobody insert an accepted reading of a document the assistant read.
 */
export function contractReadingsSql(households: readonly HouseholdSeed[], ctx: Pick<SeedContext, 'properties'>): string {
  const ids = households.flatMap((household) => contractReadings({ household, properties: ctx.properties }));
  if (ids.length === 0) return '';
  const accepted = ids.map((reading) => `(${quote(reading.id)}::uuid, ${quote(JSON.stringify(acceptedReading(reading)))}::jsonb)`);
  const list = ids.map((reading) => `${quote(reading.id)}::uuid`).join(', ');
  return `
update public.document_extractions set status = 'running' where id in (${list});
update public.document_extractions set status = 'needs_review', model = 'seed', result = ${quote(JSON.stringify(LEASE_READING))}::jsonb where id in (${list});
update public.document_extractions x set status = 'accepted', accepted_fields = v.fields from (values ${accepted.join(', ')}) as v (id, fields) where x.id = v.id;
`;
}
