import { clockAt, parseInstant } from '@esta/core';
import { reduceNationalIds } from '@esta/core/agent-schemas';
import { describe, expect, it } from 'vitest';
import { applyPlan, planChanges, reduceTypedIds } from './batch';
import type { Db } from './db';
import type { LocalContext } from './files';
import { fakeDb } from './test/fake-db';

describe('reduceTypedIds', () => {
  const digitTail = '5a7ba01a-8719-4c6b-a777-000000000123';
  const typed = { id: digitTail, property_id: digitTail, refs: [digitTail], set: { notes: 'Demo: chủ cũ CCCD 001234567890, gọi trước' } };

  it('reads a uuid whose last group is all digits as an ID number when left to the reducer alone', () => {
    expect(reduceNationalIds(typed)).toMatchObject({ id: '0123', property_id: '0123', refs: ['5a7ba01a-8719-4c6b-a777-0123'] });
  });

  it('keeps every such uuid whole under any key and cuts an ID number Ryan typed to its last four', () => {
    expect(reduceTypedIds(typed)).toEqual({ ...typed, set: { notes: 'Demo: chủ cũ CCCD 7890, gọi trước' } });
  });

  it('keeps a file path whole, so the file it names is the one read, and still cuts the title', () => {
    const attach = { path: 'Demo/hop-dong-demo-079123456789.pdf', title: 'Hợp đồng Demo CCCD 001234567890' };
    expect(reduceTypedIds(attach)).toEqual({ path: attach.path, title: 'Hợp đồng Demo CCCD 7890' });
  });
});

const HOUSEHOLD = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0001';
const MISSING = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0009';
const PLAN_ID = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0010';

function batchContext(db: Db): LocalContext {
  const noFiles = async (): Promise<never> => {
    throw new Error('no files in this test');
  };
  return { db, householdId: HOUSEHOLD, clock: clockAt({ kind: 'env', now: parseInstant('2026-10-07T02:00:00.000Z') }, 'Asia/Ho_Chi_Minh'), files: { readDocument: noFiles, previews: noFiles } };
}

const plannedItems = (result: Awaited<ReturnType<typeof planChanges>>) => (result.ok || result.reason.kind !== 'items_refused' ? [] : result.reason.items);
const edit = (id: unknown) => ({ op: 'property.edit' as const, input: { id, set: { notes: 'Demo' } } });

describe('planChanges with refs', () => {
  it('refuses an item that names a refused item as blocked, without planning it', async () => {
    const { db, sent } = fakeDb();
    const result = await planChanges(batchContext(db), { summary: 'Demo', items: [{ op: 'property.create', ref: 'house', input: { property: {} } }, edit({ $ref: 'house' })] });
    expect(plannedItems(result)).toMatchObject([{ status: 'refused', refusal: { kind: 'invalid' } }, { status: 'refused', refusal: { kind: 'blocked', by: [0] } }]);
    expect(sent.filter((request) => request.table === 'properties')).toEqual([]);
  });

  it('refuses an unknown or forward ref, and a ref on an item that creates nothing', async () => {
    const { db } = fakeDb();
    const result = await planChanges(batchContext(db), { summary: 'Demo', items: [edit({ $ref: 'later' }), { ...edit(MISSING), ref: 'later' }] });
    expect(plannedItems(result)).toMatchObject([
      { status: 'refused', refusal: { kind: 'unknown_ref', ref: 'later' } },
      { status: 'refused', refusal: { kind: 'invalid', issues: [{ path: 'ref', code: 'not_a_create' }] } },
    ]);
  });
});

const demoProperty = {
  nickname: 'Demo Nhà Q7',
  code: 'DEMOQ7',
  kind: 'townhouse',
  kind_details: {},
  use_mode: 'rental',
  legal_status: 'certified',
  current_address: null,
  certificate_address_text: null,
  acquired_on: null,
  acquisition_kind: null,
  acquisition_price_vnd: null,
  notes: null,
};

describe('planChanges with a room on a property planned beside it', () => {
  it('plans the room against the planned property and stores the item it needs', async () => {
    const { db, sent } = fakeDb((request) => (request.method === 'POST' && request.table === 'change_batches' ? [{ id: PLAN_ID }] : []));
    const room = { label: 'Phòng 2', kind: 'room', area_m2: null, list_rent_vnd: 9_000_000, available_from: null };
    const result = await planChanges(batchContext(db), {
      summary: 'Demo',
      items: [
        { op: 'property.create', ref: 'house', input: { property: demoProperty } },
        { op: 'unit.create', input: { property_id: { $ref: 'house' }, unit: room } },
      ],
    });
    if (!result.ok) throw new Error(`expected the batch to plan, got ${JSON.stringify(result.reason)}`);
    const [house, unit] = result.value.items;
    expect(unit).toMatchObject({ status: 'change', change: { property_id: house?.id, row: room } });
    const stored = sent.find((request) => request.method === 'POST' && request.table === 'change_batches');
    expect(stored?.body).toMatchObject({ plan: { items: [{ needs: [] }, { needs: [0], input: { id: unit?.id, property_id: house?.id } }] } });
  });
});

describe('applyPlan with needs', () => {
  it('refuses an item whose needed item was refused at apply as blocked, without planning it, and ends partial', async () => {
    const stored = { v: 1, items: [0, 1, 2].map((index) => ({ op: 'property.edit', id: null, needs: index === 1 ? [0] : [], input: { id: MISSING, set: { notes: 'Demo' } }, change: {} })) };
    const { db, sent } = fakeDb((request) => (request.table !== 'change_batches' ? [] : [{ id: PLAN_ID, plan: stored }]));
    const applied = await applyPlan(batchContext(db), PLAN_ID);
    expect(applied).toMatchObject({
      ok: true,
      value: { status: 'partial', items: [{ status: 'refused', refusal: { kind: 'not_found' } }, { status: 'refused', refusal: { kind: 'blocked', by: [0] } }, { status: 'refused', refusal: { kind: 'not_found' } }] },
    });
    expect(sent.filter((request) => request.table === 'properties')).toHaveLength(2);
  });

  it('reads a plan stored before refs existed as needing nothing', async () => {
    const stored = { v: 1, items: [{ op: 'property.edit', id: null, input: { id: MISSING, set: { notes: 'Demo' } }, change: {} }] };
    const { db } = fakeDb((request) => (request.table !== 'change_batches' ? [] : [{ id: PLAN_ID, plan: stored }]));
    expect(await applyPlan(batchContext(db), PLAN_ID)).toMatchObject({ ok: true, value: { items: [{ status: 'refused', refusal: { kind: 'not_found' } }] } });
  });
});
