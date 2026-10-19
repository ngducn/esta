import { DOCUMENT_PREVIEWS, previewSize } from '@esta/core/documents/previews';
import { DOCUMENTS_BUCKET, documentRegister, propertyCreate, readClock, runOp, signDocumentUploads, type Db, type OpContext } from '@esta/ops';
import { randomUUID } from 'node:crypto';
import { cpSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { appliedSchema, call, clientAt, plannedSchema, ROOT, sessionFiles, signIn, startConnector, type Connector } from './test/connector';

// Run against a fresh `pnpm db:reset`. Lane 9 loads the Demo folder through the connector; lane 8 enters the same
// properties and files the way the property form and the vault upload do, through the same ops and a signed PUT.
const CLAUDE_LANE = 9;
const HAND_LANE = 8;
const household = (lane: number) => seedId(`seed:household:lane-${lane}`);

const sessions = sessionFiles();
const work = realpathSync(mkdtempSync(join(tmpdir(), 'esta-folder-it-')));
const imports = join(work, 'import');
const outside = join(work, 'outside');
afterAll(async () => {
  await sessions.discard();
  rmSync(work, { recursive: true, force: true });
});

const cellSchema = z.object({ type: z.enum(['text', 'number', 'date', 'boolean']), text: z.string() }).nullable();
const sheetsSchema = z.object({ sheets: z.array(z.object({ name: z.string(), rows: z.array(z.array(cellSchema)), truncated: z.boolean() })) });
type Cell = z.output<typeof cellSchema>;

/** The words a family writes in its tracker, as Claude reads them into Esta's values. */
const WORDS = {
  kind: { 'Nhà phố': 'townhouse', 'Đất nông nghiệp': 'agricultural_land' },
  use: { 'Cho thuê': 'rental', 'Để đó': 'held' },
  legal: { 'Sổ hồng': 'certified', 'Sổ đỏ': 'certified' },
  acquisition: { Mua: 'purchase', 'Thừa kế': 'inheritance' },
} as const satisfies Record<string, Record<string, string>>;
const STREETS: Record<string, { house_no: string | null; street: string }> = {
  DEMOQ3: { house_no: '12/45', street: 'Lê Văn Sỹ' },
  DEMOCC: { house_no: null, street: 'Ấp Tân Phú' },
};
const PAPERS = [
  { code: 'DEMOQ3', file: 'so-hong-demo-le-van-sy.jpg', category: 'certificate', title: 'Sổ hồng Demo Lê Văn Sỹ' },
  { code: 'DEMOQ3', file: 'hop-dong-thue-demo-le-van-sy.pdf', category: 'lease_contract', title: 'Hợp đồng thuê Demo Lê Văn Sỹ' },
  { code: 'DEMOCC', file: 'so-do-demo-cu-chi.jpg', category: 'certificate', title: 'Sổ đỏ Demo Củ Chi' },
] as const;

const word = <T extends Record<string, string>>(table: T, cell: Cell): T[keyof T] => {
  const text = cell?.text ?? '';
  if (!Object.hasOwn(table, text)) throw new Error(`No word for ${text}`);
  return table[text as keyof T];
};

const PROPERTY_COLUMNS = 'nickname, code, kind, kind_details, use_mode, legal_status, current_address, certificate_address_text, acquired_on, acquisition_kind, acquisition_price_vnd, notes';
const DOCUMENT_COLUMNS = 'title, category, mime, size_bytes, page_count, sha256, sensitivity, expires_on, lease_id, tags, storage_path';

describe('loads the Demo folder into the household as Ryan would enter it by hand', () => {
  let connector: Connector;
  let other: Connector;
  let claudeDb: Db;
  let handDb: Db;
  const propertyIds = new Map<string, string>();
  const documentIds = new Map<string, string>();
  const handDocumentIds = new Map<string, string>();

  beforeAll(async () => {
    mkdirSync(outside, { recursive: true });
    cpSync(join(ROOT, 'fixtures', 'connector-demo', 'Demo'), join(imports, 'Demo'), { recursive: true });
    cpSync(join(imports, 'Demo', 'so-do-demo-cu-chi.jpg'), join(outside, 'giay-to-rieng.jpg'));
    writeFileSync(join(outside, 'tai-san.csv'), 'Mã,Tên\nDEMOX,Demo riêng\n');
    symlinkSync(join(outside, 'giay-to-rieng.jpg'), join(imports, 'Demo', 'loi-tat.jpg'));
    symlinkSync(outside, join(imports, 'Demo', 'thu-muc-rieng'));
    linkSync(join(outside, 'giay-to-rieng.jpg'), join(imports, 'Demo', 'ban-sao.jpg'));
    cpSync(join(imports, 'Demo', 'hop-dong-thue-demo-le-van-sy.pdf'), join(imports, 'Demo', 'hop-dong-demo-079123456789.pdf'));
    mkdirSync(join(imports, 'Vong'));
    writeFileSync(join(imports, 'Vong', 'ghi-chu.csv'), 'Mã,Tên\nDEMOV,Demo vòng\n');
    symlinkSync(join(imports, 'Vong', 'b'), join(imports, 'Vong', 'a'));
    symlinkSync(join(imports, 'Vong', 'a'), join(imports, 'Vong', 'b'));

    const [claudeFile, handFile] = [sessions.make(), sessions.make()];
    expect(await signIn(`ryan.lane${CLAUDE_LANE}@demo.esta.test`, claudeFile)).toMatchObject({ ok: true });
    expect(await signIn(`ryan.lane${HAND_LANE}@demo.esta.test`, handFile)).toMatchObject({ ok: true });
    [claudeDb, handDb] = [clientAt(claudeFile), clientAt(handFile)];
    [connector, other] = await Promise.all([startConnector(claudeFile, { ESTA_IMPORT_ROOTS: imports }), startConnector(handFile, { ESTA_IMPORT_ROOTS: imports })]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([connector.client.close(), other.client.close()]);
  });

  const handContext = async (): Promise<OpContext> => ({ db: handDb, householdId: household(HAND_LANE), clock: await readClock(handDb, { ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh' }) });

  /** What Claude does with a tracker row: words to values, typed text through Esta's parsers, the old address to codes. */
  async function propertyFrom(row: readonly Cell[]) {
    const [code, nickname, kind, use, address, certificate, legal, acquiredOn, acquisition, price, notes] = row;
    const money = price?.type === 'number' ? Number(price.text) : z.object({ vnd: z.number() }).parse((await call(connector, 'parse_money', { text: price?.text })).json()).vnd;
    const date = acquiredOn?.type === 'date' ? acquiredOn.text : z.object({ date: z.string() }).parse((await call(connector, 'parse_date', { text: acquiredOn?.text })).json()).date;
    const { suggestions } = z
      .object({ suggestions: z.array(z.object({ communeCode: z.string(), provinceCode: z.string() })) })
      .parse((await call(connector, 'resolve_address', { text: address?.text })).json());
    const [unit] = suggestions;
    if (code === null || code === undefined || nickname === null || nickname === undefined || unit === undefined) throw new Error('The tracker row is incomplete');
    return {
      nickname: nickname.text,
      code: code.text,
      kind: word(WORDS.kind, kind ?? null),
      kind_details: {},
      use_mode: word(WORDS.use, use ?? null),
      legal_status: word(WORDS.legal, legal ?? null),
      current_address: { ...STREETS[code.text], commune_code: unit.communeCode, province_code: unit.provinceCode },
      certificate_address_text: certificate?.text ?? null,
      acquired_on: date,
      acquisition_kind: word(WORDS.acquisition, acquisition ?? null),
      acquisition_price_vnd: money,
      notes: notes?.text ?? null,
    };
  }

  it('lists the folder with names, kinds and sizes, never contents', async () => {
    const listed = await call(connector, 'list_folder', { path: 'Demo' });
    const pdfSize = readFileSync(join(imports, 'Demo', 'hop-dong-thue-demo-le-van-sy.pdf')).length;
    expect(listed.json()).toEqual({
      entries: expect.arrayContaining([
        { name: 'hop-dong-thue-demo-le-van-sy.pdf', kind: 'file', size: pdfSize },
        { name: 'ban-sao.jpg', kind: 'refused', problem: 'outside_import_folders' },
        { name: 'hop-dong-demo-079123456789.pdf', kind: 'refused', problem: 'id_number_in_name' },
        { name: 'loi-tat.jpg', kind: 'refused', problem: 'outside_import_folders' },
        { name: 'thu-muc-rieng', kind: 'refused', problem: 'outside_import_folders' },
        { name: 'theo-doi-tai-san-demo.xlsx', kind: 'file', size: expect.any(Number) },
      ]),
    });
    expect(listed.text).not.toContain('%PDF');
  });

  it('lists every other entry of a folder that holds a link loop, and logs only counts', async () => {
    const listed = await call(connector, 'list_folder', { path: 'Vong' });
    expect(listed.json()).toEqual({
      entries: [
        { name: 'a', kind: 'refused', problem: 'unreadable' },
        { name: 'b', kind: 'refused', problem: 'unreadable' },
        { name: 'ghi-chu.csv', kind: 'file', size: readFileSync(join(imports, 'Vong', 'ghi-chu.csv')).length },
      ],
    });
    expect(connector.stderr()).toContain('[connector] list_folder count=3 refused=2');
  });

  it('plans and applies the tracker properties, then their papers, and Esta holds what a person would have entered', async () => {
    const { sheets } = sheetsSchema.parse((await call(connector, 'read_spreadsheet', { path: 'Demo/theo-doi-tai-san-demo.xlsx' })).json());
    const rows = sheets[0]?.rows.slice(1) ?? [];
    const properties = await Promise.all(rows.map(propertyFrom));
    expect(properties.map((property) => [property.code, property.acquisition_price_vnd, property.acquired_on])).toEqual([
      ['DEMOQ3', 4_850_000_000, '2008-06-20'],
      ['DEMOCC', 1_250_000_000, '2005-08-15'],
    ]);

    const plannedProperties = plannedSchema.parse(
      (await call(connector, 'plan_changes', { summary: 'Demo: nạp 2 tài sản từ bảng theo dõi', items: properties.map((property) => ({ op: 'property.create', input: { property } })) })).json(),
    );
    expect(appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: plannedProperties.planId })).json()).status).toBe('applied');
    for (const [index, property] of properties.entries()) propertyIds.set(property.code, plannedProperties.items[index]?.id ?? '');

    const papers = PAPERS.map(({ code, file, category, title }) => ({ op: 'document.attach', input: { path: `Demo/${file}`, property_id: propertyIds.get(code), category, title } }));
    const plannedPapers = plannedSchema.parse((await call(connector, 'plan_changes', { summary: 'Demo: 3 giấy tờ', items: papers })).json());
    expect(plannedPapers.items[1]).toMatchObject({ status: 'change', change: { path: 'Demo/hop-dong-thue-demo-le-van-sy.pdf', file: { mime: 'application/pdf', pageCount: 2 } } });
    const applied = appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: plannedPapers.planId })).json());
    expect(applied).toMatchObject({ status: 'applied', items: [{ status: 'landed' }, { status: 'landed' }, { status: 'landed' }] });
    for (const [index, paper] of PAPERS.entries()) documentIds.set(paper.file, plannedPapers.items[index]?.id ?? '');

    const ctx = await handContext();
    const handIds = new Map<string, string>();
    for (const property of properties) {
      const id = randomUUID();
      expect(await runOp(propertyCreate, ctx, { id, property })).toMatchObject({ ok: true });
      handIds.set(property.code, id);
    }
    const handDocuments: string[] = [];
    for (const paper of PAPERS) {
      const bytes = readFileSync(join(imports, 'Demo', paper.file));
      const facts = z.object({ change: z.object({ file: z.object({ mime: z.string(), size: z.number(), sha256: z.string(), pageCount: z.number() }) }) }).parse(plannedPapers.items[PAPERS.indexOf(paper)]).change.file;
      const documentId = randomUUID();
      const uploads = await signDocumentUploads(handDb, ctx.householdId, documentId, paper.file);
      const put = await fetch(uploads?.file.url ?? '', { method: 'PUT', body: new Blob([new Uint8Array(bytes)]), headers: { 'content-type': facts.mime, 'x-upsert': 'true' } });
      expect(put.status).toBe(200);
      const registered = await runOp(documentRegister, ctx, {
        documentId,
        propertyId: handIds.get(paper.code),
        category: paper.category,
        title: paper.title,
        expiresOn: null,
        filename: paper.file,
        mime: facts.mime,
        size: facts.size,
        sha256: facts.sha256,
        pageCount: facts.pageCount,
      });
      expect(registered).toMatchObject({ ok: true });
      handDocuments.push(documentId);
      handDocumentIds.set(paper.file, documentId);
    }

    const byCode = async (db: Db, ids: readonly string[]) => (await db.from('properties').select(PROPERTY_COLUMNS).in('id', [...ids]).order('code')).data;
    expect(await byCode(claudeDb, [...propertyIds.values()])).toEqual(await byCode(handDb, [...handIds.values()]));

    const documents = async (db: Db, ids: readonly string[]) => {
      const { data } = await db.from('documents').select(DOCUMENT_COLUMNS).in('id', [...ids]).order('title');
      return (data ?? []).map(({ storage_path, ...row }) => ({ ...row, file: storage_path.split('/').at(-1) }));
    };
    const viaClaude = await documents(claudeDb, [...documentIds.values()]);
    expect(viaClaude).toHaveLength(3);
    expect(viaClaude).toEqual(await documents(handDb, handDocuments));

    const queued = async (db: Db, ids: readonly string[]) => (await db.from('document_extractions').select('document_id').in('document_id', [...ids])).data?.length;
    expect(await queued(claudeDb, [...documentIds.values()]), 'both certificates are queued for reading, as an upload queues them; nothing waits for the worker').toBe(2);
    expect(await queued(handDb, handDocuments)).toBe(2);
  }, 120_000);

  it('stores each file whole beside the thumbnail and review copy the vault shows', async () => {
    for (const paper of PAPERS) {
      const id = documentIds.get(paper.file) ?? '';
      const folder = `${household(CLAUDE_LANE)}/${id}`;
      const { data: objects } = await claudeDb.storage.from(DOCUMENTS_BUCKET).list(folder);
      expect(objects?.map((object) => object.name).toSorted()).toEqual([paper.file, 'review.webp', 'thumb.webp'].toSorted());
      const { data: vaultObjects } = await handDb.storage.from(DOCUMENTS_BUCKET).list(`${household(HAND_LANE)}/${handDocumentIds.get(paper.file) ?? ''}`);
      const vault = vaultObjects?.find((object) => object.name === paper.file)?.metadata;
      expect(vault).toMatchObject({ cacheControl: expect.any(String) });
      for (const object of objects ?? []) expect(object.metadata?.cacheControl, `${object.name} is cached as a vault upload is`).toBe(vault?.cacheControl);
      const download = async (name: string) => Buffer.from(await ((await claudeDb.storage.from(DOCUMENTS_BUCKET).download(`${folder}/${name}`)).data?.arrayBuffer() ?? new ArrayBuffer(0)));
      const [original, thumb, review] = await Promise.all([download(paper.file), download('thumb.webp'), download('review.webp')]);
      expect(original.equals(readFileSync(join(imports, 'Demo', paper.file))), 'the bytes Ryan approved, unchanged').toBe(true);
      const [thumbInfo, reviewInfo] = await Promise.all([sharp(thumb).metadata(), sharp(review).metadata()]);
      const page = paper.file.endsWith('.pdf') ? reviewInfo : await sharp(original).metadata();
      expect({ format: thumbInfo.format, width: thumbInfo.width, height: thumbInfo.height }).toEqual({ format: 'webp', ...previewSize(page.width ?? 0, page.height ?? 0, DOCUMENT_PREVIEWS.thumb.longSide) });
      expect({ format: reviewInfo.format, width: reviewInfo.width, height: reviewInfo.height }).toEqual({ format: 'webp', ...previewSize(page.width ?? 0, page.height ?? 0, DOCUMENT_PREVIEWS.review.longSide) });
    }
  });

  it('refuses the same file again as a duplicate, naming the document that holds it', async () => {
    const again = await call(connector, 'plan_changes', {
      summary: 'Demo: lại sổ đỏ',
      items: [{ op: 'document.attach', input: { path: 'Demo/so-do-demo-cu-chi.jpg', property_id: propertyIds.get('DEMOCC'), category: 'certificate', title: 'Sổ đỏ Demo Củ Chi' } }],
    });
    expect(again.json()).toMatchObject({ kind: 'items_refused', items: [{ status: 'refused', refusal: { kind: 'duplicate', documents: [{ id: documentIds.get('so-do-demo-cu-chi.jpg'), title: 'Sổ đỏ Demo Củ Chi' }] } }] });
  });

  it('refuses a file changed after Ryan saw the plan as stale, and sends nothing of it', async () => {
    const photo = join(imports, 'Demo', 'anh-moi.jpg');
    const draw = (red: number) => sharp({ create: { width: 640, height: 480, channels: 3, background: { r: red, g: 120, b: 90 } } }).jpeg().toBuffer();
    writeFileSync(photo, await draw(200));
    const planned = plannedSchema.parse(
      (
        await call(connector, 'plan_changes', {
          summary: 'Demo: ảnh mới',
          items: [{ op: 'document.attach', input: { path: 'Demo/anh-moi.jpg', property_id: propertyIds.get('DEMOCC'), category: 'photo', title: 'Ảnh Demo Củ Chi' } }],
        })
      ).json(),
    );
    writeFileSync(photo, await draw(40));
    const applied = appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planned.planId })).json());
    expect(applied).toMatchObject({ status: 'partial', items: [{ status: 'refused', refusal: { kind: 'stale' } }] });
    const id = planned.items[0]?.id ?? '';
    expect((await claudeDb.from('documents').select('id').eq('id', id)).data).toEqual([]);
    expect((await claudeDb.storage.from(DOCUMENTS_BUCKET).list(`${household(CLAUDE_LANE)}/${id}`)).data).toEqual([]);
  });

  it('refuses a path outside the import folders and a link that leaves them, in every file tool and in a plan', async () => {
    const refused = { kind: 'file', problem: 'outside_import_folders' };
    expect((await call(connector, 'list_folder', { path: outside })).json()).toEqual(refused);
    expect((await call(connector, 'read_spreadsheet', { path: join(outside, 'tai-san.csv') })).json()).toEqual(refused);
    expect((await call(connector, 'read_spreadsheet', { path: 'Demo/../../outside/tai-san.csv' })).json()).toEqual(refused);
    expect((await call(connector, 'read_spreadsheet', { path: 'Demo/thu-muc-rieng/tai-san.csv' })).json()).toEqual(refused);
    expect((await call(connector, 'read_spreadsheet', { path: 'Demo/thu-muc-rieng/khong-co.csv' })).json(), 'what exists outside stays unsaid').toEqual(refused);
    for (const path of ['Demo/loi-tat.jpg', 'Demo/ban-sao.jpg']) {
      const viaLink = await call(connector, 'plan_changes', {
        summary: 'Demo: lối tắt',
        items: [{ op: 'document.attach', input: { path, property_id: propertyIds.get('DEMOCC'), category: 'certificate', title: 'Sổ Demo' } }],
      });
      expect(viaLink.json(), path).toMatchObject({ kind: 'items_refused', items: [{ status: 'refused', refusal: refused }] });
    }
  });

  it('refuses at apply a file that gained a second name after Ryan saw the plan, and sends nothing of it', async () => {
    const photo = join(imports, 'Demo', 'anh-hai.jpg');
    writeFileSync(photo, await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 200, b: 30 } } }).jpeg().toBuffer());
    const planned = plannedSchema.parse(
      (
        await call(connector, 'plan_changes', {
          summary: 'Demo: ảnh hai',
          items: [{ op: 'document.attach', input: { path: 'Demo/anh-hai.jpg', property_id: propertyIds.get('DEMOCC'), category: 'photo', title: 'Ảnh Demo hai' } }],
        })
      ).json(),
    );
    linkSync(photo, join(outside, 'anh-hai.jpg'));
    const applied = appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planned.planId })).json());
    expect(applied).toMatchObject({ status: 'partial', items: [{ status: 'refused', refusal: { kind: 'file', problem: 'outside_import_folders' } }] });
    const id = planned.items[0]?.id ?? '';
    expect((await claudeDb.from('documents').select('id').eq('id', id)).data).toEqual([]);
    expect((await claudeDb.storage.from(DOCUMENTS_BUCKET).list(`${household(CLAUDE_LANE)}/${id}`)).data).toEqual([]);
  });

  it('refuses a file whose name holds a full ID number and stores no plan, so Claude asks Ryan to rename it', async () => {
    const before = (await claudeDb.from('change_batches').select('id', { count: 'exact', head: true })).count;
    const planned = await call(connector, 'plan_changes', {
      summary: 'Demo: hợp đồng',
      items: [{ op: 'document.attach', input: { path: 'Demo/hop-dong-demo-079123456789.pdf', property_id: propertyIds.get('DEMOQ3'), category: 'lease_contract', title: 'Hợp đồng Demo', allow_duplicate: true } }],
    });
    expect(planned.json()).toMatchObject({ kind: 'items_refused', items: [{ status: 'refused', refusal: { kind: 'file', problem: 'id_number_in_name' } }] });
    expect((await claudeDb.from('change_batches').select('id', { count: 'exact', head: true })).count).toBe(before);
  });

  it("refuses another household's property as the place for a paper", async () => {
    const foreign = await call(other, 'plan_changes', {
      summary: 'Demo: sổ của nhà khác',
      items: [{ op: 'document.attach', input: { path: 'Demo/so-hong-demo-le-van-sy.jpg', property_id: propertyIds.get('DEMOQ3'), category: 'certificate', title: 'Sổ hồng Demo' } }],
    });
    expect(foreign.json()).toMatchObject({ kind: 'items_refused', items: [{ status: 'refused', refusal: { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] } }] });
  });

  it('logs tool names, batch ids and counts, never a file name, a path or what a file holds', () => {
    const log = connector.stderr();
    expect(log).toContain('[connector] read_spreadsheet sheets=1 rows=3');
    expect(log).toMatch(/\[connector\] apply_plan batch=[0-9a-f-]+ status=applied items=3 landed=3/);
    for (const secret of ['so-hong-demo', 'theo-doi', 'Lê Văn Sỹ', 'DEMOQ3', '079123456789', 'ELOOP', work]) expect(log).not.toContain(secret);
  });
});
