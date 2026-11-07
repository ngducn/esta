import { PROPERTY_PHOTOS_BUCKET, type Db } from '@esta/ops';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { appliedSchema, call, clientAt, plannedSchema, sessionFiles, signIn, startConnector, type Connector } from './test/connector';

// Run against a fresh `pnpm db:reset`.
const LANE = 4;
const HOUSEHOLD = seedId(`seed:household:lane-${LANE}`);
const Q1 = seedId(`seed:property:lane-${LANE}:q1`);

const sessions = sessionFiles();
const work = realpathSync(mkdtempSync(join(tmpdir(), 'esta-cover-it-')));
const imports = join(work, 'import');

describe('a property cover set by talking to Claude', () => {
  let connector: Connector;
  let db: Db;

  const photo = (color: string) => sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).jpeg().toBuffer();
  const plan = (items: unknown[]) => call(connector, 'plan_changes', { summary: 'Demo: ảnh bìa nhà Q1', items });
  const cover = async () => (await db.from('properties').select('cover_photo_path').eq('id', Q1).single()).data?.cover_photo_path ?? null;
  const objects = async () => ((await db.storage.from(PROPERTY_PHOTOS_BUCKET).list(`${HOUSEHOLD}/${Q1}`)).data ?? []).map((object) => `${HOUSEHOLD}/${Q1}/${object.name}`);
  const setCover = async (file: string) => {
    const planned = plannedSchema.parse((await plan([{ op: 'property.cover', input: { property_id: Q1, path: file } }])).json());
    expect(await appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: planned.planId })).json())).toMatchObject({ status: 'applied', items: [{ status: 'landed' }] });
    return planned;
  };

  beforeAll(async () => {
    mkdirSync(join(imports, 'Demo'), { recursive: true });
    writeFileSync(join(imports, 'Demo', 'mat-tien-demo.jpg'), await photo('#c0392b'));
    writeFileSync(join(imports, 'Demo', 'san-vuon-demo.jpg'), await photo('#2980b9'));
    writeFileSync(join(imports, 'Demo', 'ghi-chu-demo.jpg'), 'Demo: đây là chữ, không phải ảnh');
    const file = sessions.make();
    expect(await signIn(`ryan.lane${LANE}@demo.esta.test`, file)).toMatchObject({ ok: true });
    db = clientAt(file);
    connector = await startConnector(file, { ESTA_IMPORT_ROOTS: imports });
  }, 60_000);

  afterAll(async () => {
    await connector.client.close();
    await sessions.discard();
    rmSync(work, { recursive: true, force: true });
  });

  it('sets the cover, replaces it, and undo points the property back at the one before', async () => {
    const seeded = await cover();
    const first = await setCover(join(imports, 'Demo', 'mat-tien-demo.jpg'));
    const firstCover = await cover();
    expect(firstCover).toMatch(new RegExp(`^${HOUSEHOLD}/${Q1}/[0-9a-f]{64}\\.jpg$`));
    expect(first.items[0]).toMatchObject({ change: { before: seeded, after: firstCover, file: { name: 'mat-tien-demo.jpg' } } });
    expect(await objects()).toContain(firstCover);

    const second = await setCover(join(imports, 'Demo', 'san-vuon-demo.jpg'));
    const secondCover = await cover();
    expect(secondCover).not.toBe(firstCover);
    expect(second.items[0]).toMatchObject({ change: { before: firstCover, after: secondCover } });
    expect(await objects()).toEqual(expect.arrayContaining([firstCover, secondCover]));
    expect((await db.storage.from(PROPERTY_PHOTOS_BUCKET).download(secondCover ?? '')).error).toBeNull();

    expect((await call(connector, 'undo_batch', { batch_id: second.planId })).json()).toEqual({ batch_id: second.planId, archived_properties: 0 });
    expect(await cover()).toBe(firstCover);
    expect((await db.storage.from(PROPERTY_PHOTOS_BUCKET).download(firstCover ?? '')).error).toBeNull();
    const audit = await db.from('audit_log').select('via, batch_id').eq('table_name', 'properties').eq('row_id', Q1).eq('batch_id', second.planId);
    expect(audit.data).toEqual(expect.arrayContaining([{ via: 'claude', batch_id: second.planId }]));
  });

  it('plans the same picture again as unchanged', async () => {
    const planned = plannedSchema.parse((await plan([{ op: 'property.cover', input: { property_id: Q1, path: join(imports, 'Demo', 'mat-tien-demo.jpg') } }])).json());
    expect(planned.items).toMatchObject([{ status: 'unchanged' }]);
  });

  it('refuses a file that is not a picture, and a property of another household', async () => {
    const refused = await plan([
      { op: 'property.cover', input: { property_id: Q1, path: join(imports, 'Demo', 'ghi-chu-demo.jpg') } },
      { op: 'property.cover', input: { property_id: seedId('seed:property:lane-8:q1'), path: join(imports, 'Demo', 'mat-tien-demo.jpg') } },
    ]);
    expect(refused.isError).toBe(true);
    expect(refused.json()).toMatchObject({
      kind: 'items_refused',
      items: [
        { status: 'refused', refusal: { kind: 'file', problem: 'unsupported_type' } },
        { status: 'refused', refusal: { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] } },
      ],
    });
  });
});
