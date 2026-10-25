import { describe, expect, it } from 'vitest';
import { parseProposal, PROPOSAL_TYPES } from './registry';

const PROPERTY = '00000000-0000-4000-8000-0000000000a1';

describe('parseProposal', () => {
  it('reads a create_task proposal and fills the optional fields with null', () => {
    expect(parseProposal({ type: 'create_task', params: { title: ' Gọi người thuê ', due_on: '2026-10-07', property_id: PROPERTY } })).toEqual({
      ok: true,
      value: { type: 'create_task', params: { title: 'Gọi người thuê', due_on: '2026-10-07', property_id: PROPERTY, lease_id: null } },
    });
  });

  const LEASE = '00000000-0000-4000-8000-0000000000b1';
  it.each([
    ['flag_data_issue', { title: 'Sổ đỏ thiếu số thửa', property_id: PROPERTY }, { lease_id: null }],
    ['draft_reminder', { title: 'Nhắc Phòng 5', lease_id: LEASE }, {}],
    ['suggest_rent_change', { title: 'Tăng tiền Phòng 2', lease_id: LEASE, effective_period_start: '2026-11-25', rent_vnd: 3_800_000 }, {}],
    ['suggest_lease_renewal', { title: 'Gia hạn Thủ Đức', lease_id: LEASE, increase_bps: 500, end_date: '2027-11-01' }, {}],
  ])('reads a %s proposal', (type, params, defaults) => {
    expect(parseProposal({ type, params })).toEqual({ ok: true, value: { type, params: { ...params, ...defaults } } });
  });

  it.each([
    ['create_task', { title: '  ' }, 'params.title'],
    ['create_task', { title: 'x'.repeat(201) }, 'params.title'],
    ['create_task', { title: 'Gọi', due_on: '2026-02-30' }, 'params.due_on'],
    ['create_task', { title: 'Gọi', property_id: 'Dĩ An' }, 'params.property_id'],
    ['create_task', { title: 'Gọi', amount: 5 }, 'params'],
    ['flag_data_issue', { title: 'Sổ đỏ', due_on: '2026-10-07' }, 'params'],
    ['draft_reminder', { title: 'Nhắc Phòng 5' }, 'params.lease_id'],
    ['suggest_rent_change', { title: 'Tăng', lease_id: LEASE, effective_period_start: '2026-11-25', rent_vnd: 0 }, 'params.rent_vnd'],
    ['suggest_rent_change', { title: 'Tăng', lease_id: LEASE, effective_period_start: '25/11/2026', rent_vnd: 3_800_000 }, 'params.effective_period_start'],
    ['suggest_lease_renewal', { title: 'Gia hạn', lease_id: LEASE, increase_bps: 10_001, end_date: '2027-11-01' }, 'params.increase_bps'],
    ['suggest_lease_renewal', { title: 'Gia hạn', lease_id: LEASE, increase_bps: 2.5, end_date: '2027-11-01' }, 'params.increase_bps'],
  ])('refuses a %s proposal with bad params (%o)', (type, params, path) => {
    const parsed = parseProposal({ type, params });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason.some((line) => line.startsWith(`${path}:`))).toBe(true);
  });

  it('asks in words before a type that changes a lease', () => {
    expect(Object.entries(PROPOSAL_TYPES).flatMap(([type, spec]) => (spec.confirm === 'names_object' ? [type] : []))).toEqual(['suggest_rent_change', 'suggest_lease_renewal']);
  });

  it('refuses an unknown type and names the types it takes', () => {
    expect(parseProposal({ type: 'sell_property', params: {} })).toEqual({
      ok: false,
      reason: [`type: "sell_property" is not a proposal type; use one of ${Object.keys(PROPOSAL_TYPES).join(', ')}`],
    });
  });

  it('refuses a value that is not a proposal at all', () => {
    expect(parseProposal(null).ok).toBe(false);
    expect(parseProposal({ params: {} }).ok).toBe(false);
  });

  it('names each text param a type writes, and every one is a param of that type', () => {
    for (const [type, spec] of Object.entries(PROPOSAL_TYPES)) {
      const keys = Object.keys(spec.params.shape);
      for (const text of spec.texts) expect(keys, type).toContain(text);
    }
  });
});
