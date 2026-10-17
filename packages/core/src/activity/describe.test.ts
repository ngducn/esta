import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { activityTime, describeActivity, type ActivityRow } from './describe';

const memberRow = (overrides: Partial<ActivityRow>): ActivityRow => ({
  table: 'properties',
  action: 'update',
  actorKind: 'user',
  actorId: '6f1c2c1e-0000-4000-8000-000000000001',
  actorName: 'Nguyễn Thị Demo',
  diff: {},
  ...overrides,
});

describe('describeActivity', () => {
  it('reads an insert as created, and a seed insert names the seed as its actor', () => {
    expect(describeActivity(memberRow({ action: 'insert', diff: { nickname: { old: null, new: 'Nhà Demo' } } }))).toEqual({
      actor: { kind: 'member', name: 'Nguyễn Thị Demo' },
      event: 'created',
      params: {},
    });
    expect(describeActivity(memberRow({ action: 'insert', actorKind: 'system', actorId: 'seed', actorName: null })).actor).toEqual({ kind: 'seed' });
  });

  it('reads a pin set as a location update and a pin removed as cleared', () => {
    expect(describeActivity(memberRow({ diff: { location: { old: null, new: '0101000020E6' } } })).event).toBe('location');
    expect(describeActivity(memberRow({ diff: { location: { old: '0101000020E6', new: null } } })).event).toBe('locationCleared');
  });

  it('reads a rename with the new nickname as its parameter', () => {
    expect(describeActivity(memberRow({ diff: { nickname: { old: 'Nhà cũ', new: 'Đất vườn Long An' } } }))).toEqual({
      actor: { kind: 'member', name: 'Nguyễn Thị Demo' },
      event: 'renamed',
      params: { name: 'Đất vườn Long An' },
    });
  });

  it('reads deleted_at set as archived and cleared as restored', () => {
    expect(describeActivity(memberRow({ diff: { deleted_at: { old: null, new: '2026-10-07T02:00:00+00:00' } } })).event).toBe('archived');
    expect(describeActivity(memberRow({ diff: { deleted_at: { old: '2026-10-07T02:00:00+00:00', new: null } } })).event).toBe('restored');
  });

  it('falls back to updated for an unknown key, for two kinds of change at once, and for an unknown table', () => {
    expect(describeActivity(memberRow({ diff: { notes: { old: null, new: 'Ghi chú' } } })).event).toBe('updated');
    expect(
      describeActivity(memberRow({ diff: { nickname: { old: 'A', new: 'B' }, location: { old: null, new: '0101' } } })),
    ).toEqual({ actor: { kind: 'member', name: 'Nguyễn Thị Demo' }, event: 'updated', params: {} });
    expect(describeActivity(memberRow({ table: 'leases', diff: { nickname: { old: 'A', new: 'B' } } })).event).toBe('updated');
  });

  it('names the assistant, other system actors and a member without a display name', () => {
    expect(describeActivity(memberRow({ actorKind: 'agent', actorId: 'w1', actorName: null })).actor).toEqual({ kind: 'assistant' });
    expect(describeActivity(memberRow({ actorKind: 'system', actorId: 'postgres', actorName: null })).actor).toEqual({ kind: 'system' });
    expect(describeActivity(memberRow({ actorName: null })).actor).toEqual({ kind: 'member', name: null });
  });
});

describe('activityTime', () => {
  it('formats the instant in the business timezone', () => {
    expect(activityTime(parseInstant('2026-10-07T09:00:00+07:00'), 'Asia/Ho_Chi_Minh')).toEqual({ time: '09:00', date: '07/10/2026' });
    expect(activityTime(parseInstant('2026-10-07T17:30:00Z'), 'Asia/Ho_Chi_Minh')).toEqual({ time: '00:30', date: '08/10/2026' });
  });
});
