import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { LEASE_TRANSITIONS, activationRefusals, type ActivationFacts } from './state';

const draft: ActivationFacts = { status: 'draft', tenantPartyId: 'tenant', startDate: d('2026-08-01'), rentVnd: vnd(3_000_000) };

describe('lease state machine (LSE-2)', () => {
  it('allows draft to active, active to ended or terminated, and nothing out of ended or terminated', () => {
    expect(LEASE_TRANSITIONS).toEqual({ draft: ['active'], active: ['ended', 'terminated'], ended: [], terminated: [] });
  });

  it('activates a complete draft', () => {
    expect(activationRefusals(draft, d('2026-09-30'))).toEqual([]);
    expect(activationRefusals(draft, null)).toEqual([]);
  });

  it('names every missing term at once', () => {
    expect(activationRefusals({ ...draft, tenantPartyId: null, startDate: null, rentVnd: null }, null)).toEqual(['missing_tenant', 'missing_start', 'missing_rent']);
  });

  it('refuses a paid-through date before the start', () => {
    expect(activationRefusals(draft, d('2026-07-31'))).toEqual(['paid_through_before_start']);
  });

  it.each(['active', 'ended', 'terminated'] as const)('refuses to activate a lease that is %s', (status) => {
    expect(activationRefusals({ ...draft, status }, null)).toEqual(['not_draft']);
  });
});
