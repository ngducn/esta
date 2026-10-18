import { describe, expect, it } from 'vitest';
import { COMPLETENESS_CHECKS } from './registry';
import { nextMissing, scoreProperty } from './score';
import { SEED_FACTS } from './seed-facts.fixture';
import type { CompletenessCheck, CompletenessFacts } from './types';

const PROPERTY = '00000000-0000-4000-8000-000000000001';
const PARCEL = '00000000-0000-4000-8000-000000000002';

const complete: CompletenessFacts = {
  propertyId: PROPERTY,
  kind: 'townhouse',
  hasCurrentAddress: true,
  hasLocation: true,
  hasAcquisition: true,
  parcelCount: 1,
  parcelWithoutNumberId: null,
  parcelWithoutAreaId: null,
  structureCount: 1,
  structureWithoutFloorAreaId: null,
  shareTotalBp: 10_000,
  utilityAccountCount: 1,
  certificateDocumentCount: 1,
  photoCount: 1,
};

const empty: CompletenessFacts = {
  ...complete,
  hasCurrentAddress: false,
  hasLocation: false,
  hasAcquisition: false,
  parcelCount: 0,
  structureCount: 0,
  shareTotalBp: 0,
  utilityAccountCount: 0,
  certificateDocumentCount: 0,
  photoCount: 0,
};

const score = (facts: CompletenessFacts) => scoreProperty(facts, COMPLETENESS_CHECKS);

describe('scoreProperty', () => {
  it('scores 100 with nothing missing', () => {
    expect(score(complete)).toEqual({ percent: 100, failing: [] });
  });

  it('scores 0 with every check failing, and links an empty legal record to new items', () => {
    const result = score(empty);
    expect(result.percent).toBe(0);
    expect(result.failing.map((item) => item.href)).toEqual([
      `/properties/${PROPERTY}/legal/parcels/new#parcel-no`,
      `/properties/${PROPERTY}/legal/parcels/new#parcel-area`,
      `/properties/${PROPERTY}/legal#owners`,
      `/properties/${PROPERTY}/documents#upload`,
      `/properties/${PROPERTY}/edit#current-address`,
      `/properties/${PROPERTY}#location`,
      `/properties/${PROPERTY}/edit#acquisition`,
      `/properties/${PROPERTY}/rental/accounts/new#account-kind`,
      `/properties/${PROPERTY}/documents#upload`,
    ]);
  });

  it('rounds half up', () => {
    const registry: CompletenessCheck[] = [
      { id: 'a', weight: 1, kinds: 'all', passes: () => true, link: () => ({ path: '', anchor: 'a' }) },
      { id: 'b', weight: 7, kinds: 'all', passes: () => false, link: () => ({ path: '', anchor: 'b' }) },
    ];
    expect(scoreProperty(complete, registry).percent).toBe(13);
    expect(scoreProperty(complete, registry.toReversed().map((check) => ({ ...check, passes: () => check.id === 'b' }))).percent).toBe(88);
  });

  it('fails ownersComplete at 9000 bp and lowers the score (PRP-3)', () => {
    const result = score({ ...complete, shareTotalBp: 9000 });
    expect(result.percent).toBe(86);
    expect(result.failing).toEqual([{ id: 'ownersComplete', href: `/properties/${PROPERTY}/legal#owners` }]);
    expect(score({ ...complete, shareTotalBp: 10_500 }).failing.map((item) => item.id)).toEqual(['ownersComplete']);
  });

  it('orders the next three by weight, then registry order', () => {
    const result = score({ ...complete, parcelWithoutAreaId: PARCEL, hasLocation: false, hasCurrentAddress: false, hasAcquisition: false });
    expect(nextMissing(result, 3).map((item) => item.id)).toEqual(['landArea', 'currentAddress', 'pin']);
    expect(nextMissing(result, 3)[0]?.href).toBe(`/properties/${PROPERTY}/legal/parcels/${PARCEL}#parcel-area`);
  });

  it('changes only the scores of the kinds a new check applies to', () => {
    const extra: CompletenessCheck = { id: 'extra', weight: 30, kinds: ['warehouse'], passes: () => false, link: () => ({ path: '', anchor: 'x' }) };
    const registry = [...COMPLETENESS_CHECKS, extra];
    expect(scoreProperty(complete, registry).percent).toBe(100);
    expect(scoreProperty({ ...complete, kind: 'warehouse' }, registry).percent).toBe(79);
  });
});

describe('the Gia đình Demo 1 seed (PRP-6)', () => {
  it('scores Đất vườn Long An below 60 with its parcel number, area and certificate photo first', () => {
    const longAn = SEED_FACTS['long-an'];
    const result = score(longAn);
    expect(result.percent).toBeLessThan(60);
    expect(nextMissing(result, 3).map((item) => item.id)).toEqual(['parcelIds', 'landArea', 'certificateDocument']);
    expect(nextMissing(result, 1)[0]?.href).toBe(`/properties/${longAn.propertyId}/legal/parcels/${longAn.parcelWithoutNumberId}#parcel-no`);
  });

  it.each(Object.entries(SEED_FACTS).filter(([key]) => key !== 'long-an'))('scores %s at least 60', (_, facts) => {
    expect(score(facts).percent).toBeGreaterThanOrEqual(60);
  });

  it('asks Mặt bằng Quận 1 for its utility accounts', () => {
    expect(score(SEED_FACTS.q1).failing.map((item) => item.id)).toEqual(['utilityAccounts']);
  });
});
