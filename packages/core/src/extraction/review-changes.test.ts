import { describe, expect, it } from 'vitest';
import truthFile from '../../../../fixtures/certificates/gcn_2024-photo/truth.json';
import { planCertificateAcceptance, type AcceptanceExtraction, type Decisions } from './acceptance';
import { reviewFields } from './fields';
import { certificateMismatches, replacedAddress, savedAddress, soleProvince, type PropertyFacts } from './review-changes';

const extraction: AcceptanceExtraction = {
  id: '00000000-0000-4000-8000-0000000000e1',
  householdId: '00000000-0000-4000-8000-0000000000a0',
  propertyId: '00000000-0000-4000-8000-0000000000b0',
  documentId: '00000000-0000-4000-8000-0000000000d0',
  result: truthFile.certificate,
};

const acceptAll: Record<string, Decisions[string]> = Object.fromEntries(reviewFields('certificate_v1', extraction.result).map((field) => [field.path, { kind: 'accepted' as const }]));

function saved(decisions: Decisions = acceptAll) {
  const result = planCertificateAcceptance(extraction, decisions, { parties: [] });
  if (!result.ok) throw new Error(`${result.reason}: ${result.paths.join(', ')}`);
  return result.plan.acceptedFields;
}

const HCMC = '79';
const LONG_AN = '80';
const read = 'phường An Phú, thành phố Thủ Đức, Thành phố Hồ Chí Minh';
const matchingProperty: PropertyFacts = { provinceCode: HCMC, owners: [{ fullName: 'Đặng Quốc Demo' }] };

describe('what saving a certificate review writes over (#356)', () => {
  it('takes the first parcel address the review decided, as the save writes it', () => {
    expect(savedAddress(saved())).toEqual({ path: 'parcels[0].address_text', value: read });
    expect(savedAddress(saved({ ...acceptAll, 'parcels[0].address_text': { kind: 'edited', value: 'Số 12 Demo, phường An Phú' } }))).toEqual({
      path: 'parcels[0].address_text',
      value: 'Số 12 Demo, phường An Phú',
    });
    const { 'parcels[0].address_text': _address, ...undecided } = acceptAll;
    expect(savedAddress(saved(undecided))).toBeNull();
  });

  it('names the certificate address it replaces, before and after', () => {
    const before = 'Thửa đất số 906 Demo, tờ bản đồ số 96, Phường 2, Thành phố Tân An, Tỉnh Long An';
    expect(replacedAddress(saved(), before)).toEqual({ path: 'parcels[0].address_text', before, after: read });
  });

  it('replaces nothing on a property with no certificate address yet, or with the same one', () => {
    expect(replacedAddress(saved(), null)).toBeNull();
    expect(replacedAddress(saved(), '  ')).toBeNull();
    expect(replacedAddress(saved(), 'PHƯỜNG AN PHÚ,  thành phố Thủ Đức, Thành phố Hồ Chí Minh')).toBeNull();
  });
});

describe('the signs a certificate is another property’s (#356)', () => {
  it('finds none when the province and a holder match the property', () => {
    expect(certificateMismatches(saved(), matchingProperty, HCMC)).toEqual([]);
    expect(certificateMismatches(saved(), { provinceCode: HCMC, owners: [{ fullName: 'ĐẶNG QUỐC  demo' }] }, HCMC)).toEqual([]);
  });

  it('marks the address when it lies in another province than the property', () => {
    expect(certificateMismatches(saved(), { ...matchingProperty, provinceCode: LONG_AN }, HCMC)).toEqual([{ kind: 'province', paths: ['parcels[0].address_text'] }]);
  });

  it('marks every holder when none of them owns the property', () => {
    const owners = [{ fullName: 'Trần Minh Demo' }];
    expect(certificateMismatches(saved(), { provinceCode: HCMC, owners }, HCMC)).toEqual([{ kind: 'holders', paths: ['holders[0].full_name', 'holders[1].full_name'] }]);
  });

  it('finds Mẹ among the holders of Dãy trọ Dĩ An when her record holds her CCCD digits and the certificate her CMND', () => {
    const decisions: Decisions = { ...acceptAll, 'holders[0].full_name': { kind: 'edited', value: 'Nguyễn Thị Demo' }, 'holders[0].id_last4': { kind: 'edited', value: '4567' } };
    expect(certificateMismatches(saved(decisions), { provinceCode: HCMC, owners: [{ fullName: 'Nguyễn Thị Demo' }] }, HCMC)).toEqual([]);
  });

  it.each([
    ['old tone placement', 'Lê Thị Hoà Demo', 'Lê Thị Hòa Demo'],
    ['no diacritics', 'Nguyen Thi Lan', 'NGUYỄN THỊ LAN'],
    ['a title', 'Hộ bà Nguyễn Thị Demo', 'Nguyễn Thị Demo'],
  ])('finds the owner when the holder is written with %s', (_case, holder, owner) => {
    const decisions: Decisions = { ...acceptAll, 'holders[0].full_name': { kind: 'edited', value: holder } };
    expect(certificateMismatches(saved(decisions), { provinceCode: HCMC, owners: [{ fullName: owner }] }, HCMC)).toEqual([]);
  });

  it('still stops on a truly different person', () => {
    const owners = [{ fullName: 'Trần Văn Demo' }];
    expect(certificateMismatches(saved(), { provinceCode: HCMC, owners }, HCMC)).toEqual([{ kind: 'holders', paths: ['holders[0].full_name', 'holders[1].full_name'] }]);
  });

  it('names both on the gcn_2024 photo saved onto Đất vườn Long An', () => {
    expect(certificateMismatches(saved(), { provinceCode: LONG_AN, owners: [{ fullName: 'Trần Minh Demo' }] }, HCMC)).toEqual([
      { kind: 'province', paths: ['parcels[0].address_text'] },
      { kind: 'holders', paths: ['holders[0].full_name', 'holders[1].full_name'] },
    ]);
  });

  it('judges nothing it has nothing to compare with: a new property, an address no province reads from, a review with no holder', () => {
    expect(certificateMismatches(saved(), { provinceCode: null, owners: [] }, HCMC)).toEqual([]);
    expect(certificateMismatches(saved(), { ...matchingProperty, provinceCode: LONG_AN }, null)).toEqual([]);
    const withoutHolders = Object.fromEntries(Object.entries(acceptAll).filter(([path]) => !path.startsWith('holders[')));
    expect(certificateMismatches(saved(withoutHolders), { provinceCode: HCMC, owners: [{ fullName: 'Trần Minh Demo' }] }, HCMC)).toEqual([]);
  });

  it('reads an address’s province only when every current unit it maps to lies in one', () => {
    expect(soleProvince([HCMC, HCMC])).toBe(HCMC);
    expect(soleProvince([HCMC, LONG_AN])).toBeNull();
    expect(soleProvince([])).toBeNull();
  });
});
