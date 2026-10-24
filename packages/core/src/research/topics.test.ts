import { describe, expect, it } from 'vitest';
import { NATIONAL_TOPICS } from './national-topics';
import { deriveResearchTopics, type LegacyUnit, type TopicProperty } from './topics';

const ADMIN_UNITS = new Map([
  ['68', 'Tỉnh Lâm Đồng'],
  ['75', 'Thành phố Đồng Nai'],
  ['79', 'Thành phố Hồ Chí Minh'],
  ['80', 'Tỉnh Tây Ninh'],
  ['24823', 'Phường 1 Bảo Lộc'],
  ['25942', 'Phường Dĩ An'],
  ['26188', 'Phường Tân Triều'],
  ['26740', 'Phường Sài Gòn'],
  ['26824', 'Phường Thủ Đức'],
  ['27475', 'Phường Tân Hưng'],
  ['27694', 'Phường Long An'],
]);

/** The seven properties of the `full` seed, by key, with their current commune and province. */
const SEED: readonly TopicProperty[] = [
  { id: 'q7', kind: 'townhouse', provinceCode: '79', communeCode: '27475' },
  { id: 'thu-duc', kind: 'apartment', provinceCode: '79', communeCode: '26824' },
  { id: 'di-an', kind: 'rooming_house', provinceCode: '79', communeCode: '25942' },
  { id: 'q1', kind: 'commercial_space', provinceCode: '79', communeCode: '26740' },
  { id: 'bien-hoa', kind: 'warehouse', provinceCode: '75', communeCode: '26188' },
  { id: 'long-an', kind: 'agricultural_land', provinceCode: '80', communeCode: '27694' },
  { id: 'bao-loc', kind: 'residential_land', provinceCode: '68', communeCode: '24823' },
];

const unit = (newCommuneCode: string, oldProvinceName: string, oldDistrictName: string, whole = true): LegacyUnit => ({ newCommuneCode, oldProvinceName, oldDistrictName, whole });

/** The NSO conversion rows for those communes (`admin_unit_legacy_map.csv`), one per old district. */
const LEGACY: readonly LegacyUnit[] = [
  unit('24823', 'Tỉnh Lâm Đồng', 'Thành phố Bảo Lộc'),
  unit('25942', 'Tỉnh Bình Dương', 'Thành phố Dĩ An'),
  unit('26188', 'Tỉnh Đồng Nai', 'Thành phố Biên Hòa'),
  unit('26188', 'Tỉnh Đồng Nai', 'Huyện Vĩnh Cửu'),
  unit('26740', 'Thành phố Hồ Chí Minh', 'Quận 1'),
  unit('26824', 'Thành phố Hồ Chí Minh', 'Thành phố Thủ Đức'),
  unit('27475', 'Thành phố Hồ Chí Minh', 'Quận 7'),
  unit('27694', 'Tỉnh Long An', 'Thành phố Tân An'),
  unit('27694', 'Tỉnh Long An', 'Huyện Thủ Thừa', false),
];

const topics = deriveResearchTopics(SEED, ADMIN_UNITS, LEGACY);
const byKey = (key: string) => topics.find((topic) => topic.key === key);

describe('deriveResearchTopics on the seven seed properties (AGENT.md §5.2)', () => {
  it('gives one topic per province held, under its current name with the legacy names Bình Dương and Long An', () => {
    expect(topics.filter((topic) => topic.key.startsWith('province:')).map((topic) => [topic.label, topic.province_codes, topic.property_ids])).toEqual([
      ['Lâm Đồng', ['68'], ['bao-loc']],
      ['TP. Đồng Nai', ['75'], ['bien-hoa']],
      ['TP. Hồ Chí Minh (Bình Dương cũ)', ['79'], ['q7', 'thu-duc', 'di-an', 'q1']],
      ['Tây Ninh (Long An cũ)', ['80'], ['long-an']],
    ]);
  });

  it('searches the current and the legacy province names, and the rental market for the kinds held there', () => {
    const hcm = byKey('province:79')?.query_templates ?? [];
    expect(hcm).toContain('quy hoạch TP. Hồ Chí Minh');
    expect(hcm).toContain('quy hoạch Bình Dương');
    expect(hcm).toContain('thị trường cho thuê nhà phố, căn hộ, phòng trọ, mặt bằng Bình Dương');
    expect(byKey('province:80')?.query_templates).toContain('bảng giá đất Long An');
  });

  it('gives one topic per commune held, naming the old district, and the old province where it changed', () => {
    expect(topics.filter((topic) => topic.key.startsWith('commune:')).map((topic) => topic.label)).toEqual([
      'Phường 1 Bảo Lộc, Lâm Đồng (TP. Bảo Lộc cũ)',
      'Phường Dĩ An, TP. Hồ Chí Minh (TP. Dĩ An, Bình Dương cũ)',
      'Phường Tân Triều, TP. Đồng Nai (TP. Biên Hòa, Huyện Vĩnh Cửu cũ)',
      'Phường Sài Gòn, TP. Hồ Chí Minh (Quận 1 cũ)',
      'Phường Thủ Đức, TP. Hồ Chí Minh (TP. Thủ Đức cũ)',
      'Phường Tân Hưng, TP. Hồ Chí Minh (Quận 7 cũ)',
      'Phường Long An, Tây Ninh (TP. Tân An, Long An cũ)',
    ]);
    expect(byKey('commune:25942')).toMatchObject({ province_codes: ['79'], property_ids: ['di-an'], query_templates: ['quy hoạch Phường Dĩ An TP. Dĩ An', 'hạ tầng giao thông TP. Dĩ An TP. Hồ Chí Minh'] });
  });

  it('adds every national topic once, after the places, with no province or property', () => {
    const national = topics.filter((topic) => topic.key.startsWith('national:'));
    expect(national.map((topic) => topic.key)).toEqual(NATIONAL_TOPICS.map((topic) => topic.key));
    expect(topics.slice(-NATIONAL_TOPICS.length)).toEqual(national);
    expect(national.every((topic) => topic.province_codes.length === 0 && topic.property_ids.length === 0)).toBe(true);
    expect(new Set(topics.map((topic) => topic.key)).size).toBe(topics.length);
  });

  it('gives only the national topics to a household with no property', () => {
    expect(deriveResearchTopics([], ADMIN_UNITS, LEGACY).map((topic) => topic.key)).toEqual(NATIONAL_TOPICS.map((topic) => topic.key));
  });
});
