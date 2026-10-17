import { Resvg } from '@resvg/resvg-js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import satori from 'satori';
import type { CertificateForm, CertificateV1Input } from '../../../packages/core/src/agent-schemas/certificate_v1.ts';
import { flattenLeaves } from '../../../packages/core/src/extraction/score.ts';
import { rngFor } from '../../../supabase/seed/generator/rng.ts';
import { degrade, VARIANTS, type Raster, type Variant } from './degrade.ts';
import { GCN_2009_2024, GCN_2024, NORTHSTAR_DI_AN, PAPER_ONLY, SO_DO_PRE2009, SO_HONG_PRE2009, type CertificateFacts } from './facts.ts';
import { gcn20092024 } from './templates/gcn_2009_2024.tsx';
import { gcn2024 } from './templates/gcn_2024.tsx';
import { paperOnly } from './templates/paper_only.tsx';
import { PAGE_HEIGHT, PAGE_WIDTH, type CertificateTemplate, type Section } from './templates/parts.tsx';
import { soDoPre2009 } from './templates/so_do_pre2009.tsx';
import { soHongPre2009 } from './templates/so_hong_pre2009.tsx';

export const FIXTURE_SEED = 20261007;

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, '..');
const MANIFEST = join(FIXTURES_DIR, 'manifest.json');

export const TEMPLATES: Readonly<Record<CertificateForm, CertificateTemplate>> = {
  so_do_pre2009: soDoPre2009,
  so_hong_pre2009: soHongPre2009,
  gcn_2009_2024: gcn20092024,
  gcn_2024: gcn2024,
  paper_only: paperOnly,
};

const FACTS: Readonly<Record<CertificateForm, CertificateFacts>> = {
  so_do_pre2009: SO_DO_PRE2009,
  so_hong_pre2009: SO_HONG_PRE2009,
  gcn_2009_2024: GCN_2009_2024,
  gcn_2024: GCN_2024,
  paper_only: PAPER_ONLY,
};

export type FixtureSpec = { readonly id: string; readonly variant: Variant; readonly facts: CertificateFacts };

export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  ...Object.values(FACTS).flatMap((facts) => VARIANTS.map((variant) => ({ id: `${facts.form}-${variant}`, variant, facts }))),
  { id: 'northstar-di-an', variant: 'photo', facts: NORTHSTAR_DI_AN },
];

export type FixtureTruth = {
  readonly fixture_id: string;
  readonly form: CertificateForm;
  readonly variant: Variant;
  readonly files: readonly string[];
  readonly qr_payload: string | null;
  readonly printed_id_numbers: readonly string[];
  readonly handwritten_fields: readonly string[];
  readonly certificate: CertificateV1Input;
};

export type GeneratedFixture = { readonly spec: FixtureSpec; readonly files: ReadonlyMap<string, Uint8Array> };

const FONTS = (
  [
    { name: 'Sans', file: 'BeVietnamPro-Regular.ttf', weight: 400 },
    { name: 'Sans', file: 'BeVietnamPro-Bold.ttf', weight: 700 },
    { name: 'Hand', file: 'PatrickHand-Regular.ttf', weight: 400 },
  ] as const
).map(({ name, file, weight }) => ({ name, data: readFileSync(join(HERE, 'fonts', file)), weight, style: 'normal' as const }));

function pageOf(template: CertificateTemplate, section: Section): number | null {
  const index = template.pages.findIndex((page) => page.sections.includes(section));
  return index === -1 ? null : index + 1;
}

function leaf<T>(value: T | null, page: number | null) {
  if (value !== null && page === null) throw new Error(`a printed value has no page: ${String(value)}`);
  return { value, confidence: 1, page: value === null ? null : page };
}

export function certificateTruth(facts: CertificateFacts): CertificateV1Input {
  const template = TEMPLATES[facts.form];
  const at = (section: Section) => pageOf(template, section);
  return {
    form: leaf(facts.form, 1),
    holders: facts.holders.map((holder) => ({
      full_name: leaf(holder.full_name, at('holders')),
      birth_year: leaf(holder.birth_year, at('holders')),
      id_last4: leaf(holder.id_number.slice(-4), at('holders')),
      address_text: leaf(holder.address_text, at('holders')),
      relation: leaf(holder.relation, at('holders')),
    })),
    parcels: facts.parcels.map((parcel) => ({
      parcel_no: leaf(parcel.parcel_no, at('parcels')),
      map_sheet_no: leaf(parcel.map_sheet_no, at('parcels')),
      address_text: leaf(parcel.address_text, at('parcels')),
      area_m2: leaf(parcel.area_m2, at('parcels')),
      use_form: leaf(parcel.use_form, at('parcels')),
      purposes: parcel.purposes.map((purpose) => ({
        land_use_code: leaf(purpose.land_use_code, at('parcels')),
        area_m2: leaf(purpose.area_m2, at('parcels')),
        term: leaf(purpose.term, at('parcels')),
      })),
      origin_text: leaf(parcel.origin_text, at('parcels')),
    })),
    structures: facts.structures.map((structure) => ({
      kind: leaf(structure.kind, at('structures')),
      footprint_m2: leaf(structure.footprint_m2, at('structures')),
      floor_area_m2: leaf(structure.floor_area_m2, at('structures')),
      floors: leaf(structure.floors, at('structures')),
      structure_text: leaf(structure.structure_text, at('structures')),
      completed_year: leaf(structure.completed_year, at('structures')),
      ownership_term: leaf(structure.ownership_term, at('structures')),
    })),
    serial_no: leaf(facts.serial_no, at('serial_no')),
    book_entry_no: leaf(facts.book_entry_no, at('book_entry_no')),
    issued_on: leaf(facts.issued_on, at('issued')),
    issued_by: leaf(facts.issued_by, at('issued')),
    annotations: facts.annotations.map((annotation) => ({
      date: leaf(annotation.date, at('annotations')),
      text: leaf(annotation.text, at('annotations')),
      kind: leaf(annotation.kind, at('annotations')),
    })),
    has_qr: leaf(facts.qr_payload !== null, at('qr') ?? 1),
    notes_text: leaf(facts.notes_text, at('notes_text')),
  };
}

/** Every non-null leaf a person wrote by hand, as `holders[0].full_name`. */
function handwrittenFields(certificate: CertificateV1Input): string[] {
  return flattenLeaves({ holders: certificate.holders, parcels: certificate.parcels })
    .filter((entry) => entry.leaf.value !== null)
    .map((entry) => entry.path);
}

async function renderPage(template: CertificateTemplate, index: number, facts: CertificateFacts): Promise<{ raster: Raster; png: Uint8Array }> {
  const page = template.pages[index];
  if (page === undefined) throw new Error(`${facts.form} has no page ${index + 1}`);
  const qr = page.sections.includes('qr') && facts.qr_payload !== null ? await QRCode.toDataURL(facts.qr_payload, { margin: 1, width: 300 }) : null;
  const svg = await satori(page.render(facts, qr), { width: PAGE_WIDTH, height: PAGE_HEIGHT, fonts: [...FONTS] });
  const rendered = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  return { raster: { width: rendered.width, height: rendered.height, data: new Uint8Array(rendered.pixels) }, png: new Uint8Array(rendered.asPng()) };
}

const A4_POINTS = [595.28, 841.89] as const;

async function scanPdf(pngs: readonly Uint8Array[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  for (const png of pngs) {
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([...A4_POINTS]);
    page.drawImage(image, { x: 0, y: 0, width: A4_POINTS[0], height: A4_POINTS[1] });
  }
  return pdf.save({ useObjectStreams: false });
}

export async function renderPages(spec: FixtureSpec): Promise<{ raster: Raster; png: Uint8Array }[]> {
  const template = TEMPLATES[spec.facts.form];
  return Promise.all(template.pages.map((_, index) => renderPage(template, index, spec.facts)));
}

export async function renderFixture(spec: FixtureSpec, seed: number = FIXTURE_SEED): Promise<GeneratedFixture> {
  const pages = await renderPages(spec);
  const files = new Map<string, Uint8Array>();
  const { variant } = spec;
  if (variant === 'scan') {
    files.set('document.pdf', await scanPdf(pages.map((page) => page.png)));
  } else {
    const rng = rngFor(`${seed}:${spec.id}`);
    pages.forEach((page, index) => files.set(`page-${index + 1}.jpg`, degrade(page.raster, variant, rng)));
  }
  const certificate = certificateTruth(spec.facts);
  const truth: FixtureTruth = {
    fixture_id: spec.id,
    form: spec.facts.form,
    variant: spec.variant,
    files: [...files.keys()],
    qr_payload: spec.facts.qr_payload,
    printed_id_numbers: spec.facts.holders.map((holder) => holder.id_number),
    handwritten_fields: TEMPLATES[spec.facts.form].handwritten ? handwrittenFields(certificate) : [],
    certificate,
  };
  files.set('truth.json', new TextEncoder().encode(`${JSON.stringify(truth, null, 2)}\n`));
  return { spec, files };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function manifestOf(fixtures: readonly GeneratedFixture[], seed: number): string {
  const manifest = {
    seed,
    fixtures: fixtures.map(({ spec, files }) => ({
      id: spec.id,
      form: spec.facts.form,
      variant: spec.variant,
      files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])),
    })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function generateCertificateFixtures(seed: number = FIXTURE_SEED): Promise<{ fixtures: GeneratedFixture[]; manifest: string }> {
  const fixtures = await Promise.all(FIXTURE_SPECS.map((spec) => renderFixture(spec, seed)));
  return { fixtures, manifest: manifestOf(fixtures, seed) };
}

function writeFixture({ spec, files }: GeneratedFixture): void {
  const dir = join(FIXTURES_DIR, spec.id);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (!files.has(name)) rmSync(join(dir, name));
  for (const [name, bytes] of files) writeFileSync(join(dir, name), bytes);
}

async function main(): Promise<void> {
  const { fixtures, manifest } = await generateCertificateFixtures();
  const previous = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : null;
  fixtures.forEach(writeFixture);
  if (previous !== manifest) writeFileSync(MANIFEST, manifest);
  console.log(`${fixtures.length} fixtures, manifest ${previous === manifest ? 'unchanged' : 'written'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
