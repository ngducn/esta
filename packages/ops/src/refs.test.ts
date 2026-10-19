import { describe, expect, it } from 'vitest';
import { reduceTypedIds } from './batch';
import { addLabel, blockedBy, refLabelSchema, resolveRefs, type Label } from './refs';

const HOUSE = '5a7ba01a-8719-4c6b-a777-0000000000aa';
const ROOM = '5a7ba01a-8719-4c6b-a777-0000000000bb';
const labels = new Map<string, Label>([
  ['house', { index: 0, id: HOUSE }],
  ['room', { index: 2, id: ROOM }],
]);

describe('resolveRefs', () => {
  it('puts the minted id where a $ref stands for an id, at any depth, and lists the items named in order', () => {
    const input = { id: { $ref: 'house' }, lease: { unit_id: { $ref: 'room' }, party_ids: [{ $ref: 'house' }, { $ref: 'room' }] }, note: 'Demo' };
    expect(resolveRefs(input, labels)).toEqual({ ok: true, value: { input: { id: HOUSE, lease: { unit_id: ROOM, party_ids: [HOUSE, ROOM] }, note: 'Demo' }, needs: [0, 2] } });
  });

  it('refuses a $ref where no id belongs, so a minted id never lands in a text field', () => {
    expect(resolveRefs({ unit: { label: { $ref: 'room' } } }, labels)).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'unit.label', code: 'ref_not_an_id' }] } });
    expect(resolveRefs({ $ref: 'room' }, labels)).toMatchObject({ ok: false, reason: { issues: [{ code: 'ref_not_an_id' }] } });
  });

  it('leaves an object with keys beside $ref alone, as an ordinary value', () => {
    const input = { property_id: { $ref: 'house', note: 'x' } };
    expect(resolveRefs(input, labels)).toEqual({ ok: true, value: { input, needs: [] } });
  });

  it('refuses a label no earlier item registered', () => {
    expect(resolveRefs({ property_id: { $ref: 'garage' } }, labels)).toEqual({ ok: false, reason: { kind: 'unknown_ref', ref: 'garage' } });
  });

  it('runs after the ID reducer, so a full ID number typed in chat is cut while the substituted id stays whole', () => {
    const digitLabels = new Map<string, Label>([['lan', { index: 0, id: '5a7ba01a-8719-4c6b-a777-000000000123' }]]);
    const typed = reduceTypedIds({ tenant_id: { $ref: 'lan' }, note: 'CCCD 079301004567' });
    expect(resolveRefs(typed, digitLabels)).toEqual({ ok: true, value: { input: { tenant_id: '5a7ba01a-8719-4c6b-a777-000000000123', note: 'CCCD 4567' }, needs: [0] } });
  });
});

describe('addLabel', () => {
  it('registers a create only after its own refs resolved, so a self or forward ref reads unknown', () => {
    const live = new Map<string, Label>();
    expect(resolveRefs({ property_id: { $ref: 'house' } }, live)).toEqual({ ok: false, reason: { kind: 'unknown_ref', ref: 'house' } });
    expect(addLabel(live, 'house', { index: 0, id: HOUSE })).toBeNull();
    expect(resolveRefs({ property_id: { $ref: 'house' } }, live)).toMatchObject({ ok: true, value: { needs: [0] } });
  });

  it('refuses a label on an item that creates nothing, and a label used twice', () => {
    const live = new Map<string, Label>([['house', { index: 0, id: HOUSE }]]);
    expect(addLabel(live, 'edit', { index: 1, id: null })).toEqual({ kind: 'invalid', issues: [{ path: 'ref', code: 'not_a_create' }] });
    expect(addLabel(live, 'house', { index: 1, id: ROOM })).toEqual({ kind: 'invalid', issues: [{ path: 'ref', code: 'duplicate' }] });
    expect(live.get('house')).toEqual({ index: 0, id: HOUSE });
  });

  it('takes labels that start with a letter, up to forty characters', () => {
    expect(['room', 'lan-2', 'Q7_room'].every((label) => refLabelSchema.safeParse(label).success)).toBe(true);
    expect(['', '2room', 'a b', 'x'.repeat(41)].some((label) => refLabelSchema.safeParse(label).success)).toBe(false);
  });
});

describe('blockedBy', () => {
  it('names the refused items an item needs, and nothing when they planned or landed', () => {
    const earlier = [{ status: 'refused' }, { status: 'landed' }, { status: 'refused' }];
    expect(blockedBy([0, 1, 2], earlier)).toEqual({ kind: 'blocked', by: [0, 2] });
    expect(blockedBy([1], earlier)).toBeNull();
    expect(blockedBy([], earlier)).toBeNull();
  });
});
