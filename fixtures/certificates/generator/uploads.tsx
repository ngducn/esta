import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { rngFor } from '../../../supabase/seed/generator/rng.ts';
import { BILLS, BILLS_DIR } from './bills.tsx';
import { degrade } from './degrade.ts';
import { LEASES, LEASES_DIR } from './leases.tsx';
import { FIXTURE_SEED, FIXTURE_SPECS, FIXTURES_DIR, rasterize, type FixtureTruth } from './generate.ts';
import { Page } from './templates/parts.tsx';

/** The one file a member uploads for a fixture, as the browser sends it (DOC-1 stores one file per document). */
export type UploadFile = { readonly name: string; readonly mimeType: 'application/pdf' | 'image/jpeg'; readonly buffer: Buffer };

export type ExtractionFixture = {
  readonly id: string;
  readonly schemaName: 'certificate_v1' | 'utility_bill_v1' | 'lease_v1';
  readonly truth: unknown;
  readonly printedIdNumbers: readonly string[];
  upload(): Promise<UploadFile>;
};

const A4_POINTS = [595.28, 841.89] as const;

/** Photos of a multi-page certificate go up as one PDF, page order kept, as the capture flow builds it (DOC-2). */
export async function photosPdf(pages: readonly Buffer[]): Promise<Buffer> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  for (const jpeg of pages) {
    const image = await pdf.embedJpg(jpeg);
    pdf.addPage([...A4_POINTS]).drawImage(image, { x: 0, y: 0, width: A4_POINTS[0], height: A4_POINTS[1] });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

const read = (dir: string, name: string) => readFileSync(join(dir, name));

function pagesWithTruth(truth: FixtureTruth): number {
  const pages = JSON.stringify(truth.certificate).match(/"page":\d+/g) ?? [];
  return Math.max(1, ...pages.map((page) => Number(page.slice(7))));
}

function certificateUpload(dir: string, truth: FixtureTruth): () => Promise<UploadFile> {
  if (truth.files.includes('document.pdf')) return async () => ({ name: 'document.pdf', mimeType: 'application/pdf', buffer: read(dir, 'document.pdf') });
  if (pagesWithTruth(truth) === 1) return async () => ({ name: 'page-1.jpg', mimeType: 'image/jpeg', buffer: read(dir, 'page-1.jpg') });
  return async () => ({ name: 'photos.pdf', mimeType: 'application/pdf', buffer: await photosPdf(truth.files.map((name) => read(dir, name))) });
}

function singleFile(dir: string, id: string, schemaName: 'utility_bill_v1' | 'lease_v1', key: 'bill' | 'lease'): ExtractionFixture {
  const truth = JSON.parse(read(dir, 'truth.json').toString('utf8')) as { files: string[]; printed_id_numbers?: string[] } & Record<typeof key, unknown>;
  const [name = ''] = truth.files;
  const mimeType = name.endsWith('.pdf') ? ('application/pdf' as const) : ('image/jpeg' as const);
  return { id, schemaName, truth: truth[key], printedIdNumbers: truth.printed_id_numbers ?? [], upload: async () => ({ name, mimeType, buffer: read(dir, name) }) };
}

/** The sixteen certificate fixtures, the two bills and the three leases the golden extraction test scores (AGENT.md §7.2). */
export function extractionFixtures(): ExtractionFixture[] {
  const certificates = FIXTURE_SPECS.map(({ id }) => {
    const dir = join(FIXTURES_DIR, id);
    const truth = JSON.parse(read(dir, 'truth.json').toString('utf8')) as FixtureTruth;
    return { id, schemaName: 'certificate_v1' as const, truth: truth.certificate, printedIdNumbers: truth.printed_id_numbers, upload: certificateUpload(dir, truth) };
  });
  const bills = BILLS.map(({ id }) => singleFile(join(BILLS_DIR, id), id, 'utility_bill_v1', 'bill'));
  const leases = LEASES.map(({ id }) => singleFile(join(LEASES_DIR, id), id, 'lease_v1', 'lease'));
  return [...certificates, ...bills, ...leases];
}

/** A copy that differs from its base by a trailing PDF comment, so its own recording can script the model's answers. */
async function variantOf(baseId: string, label: string): Promise<UploadFile> {
  const base = read(join(FIXTURES_DIR, baseId), 'document.pdf');
  return { name: `${label}.pdf`, mimeType: 'application/pdf', buffer: Buffer.concat([base, Buffer.from(`\n% esta crafted ${label}\n`)]) };
}

async function blankPage(): Promise<UploadFile> {
  const page = await rasterize(<Page palette={{ paper: '#ffffff', frame: '#ffffff', ink: '#ffffff' }}>{null}</Page>);
  return { name: 'blank-page.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(degrade(page.raster, 'photo', rngFor(`${FIXTURE_SEED}:blank-page`))) };
}

/**
 * Inputs whose recordings are written by hand from a live one, not recorded live: a first answer that fails the
 * schema, a Read outside the job directory, and a blank page whose every answer fails validation.
 */
export const CRAFTED = {
  'repair-invalid-area': { base: 'so_hong_pre2009-scan', upload: () => variantOf('so_hong_pre2009-scan', 'repair-invalid-area') },
  'deny-outside-read': { base: 'so_do_pre2009-scan', upload: () => variantOf('so_do_pre2009-scan', 'deny-outside-read') },
  'blank-page': { base: 'so_do_pre2009-scan', upload: blankPage },
} as const satisfies Record<string, { base: string; upload: () => Promise<UploadFile> }>;

export type CraftedId = keyof typeof CRAFTED;
