import { shortProvinceName } from '../address/format-current';
import type { PropertyKind } from '../properties/kinds';
import { NATIONAL_TOPICS } from './national-topics';

export type ResearchTopic = {
  readonly key: string;
  readonly label: string;
  readonly query_templates: readonly string[];
  readonly province_codes: readonly string[];
  readonly property_ids: readonly string[];
  readonly source: 'auto';
};

export type TopicProperty = { readonly id: string; readonly kind: PropertyKind; readonly provinceCode: string; readonly communeCode: string };

/** A pre-2025 commune merged into `newCommuneCode`, whole or in part, by the names people still use (DOMAIN-VN §4). */
export type LegacyUnit = { readonly newCommuneCode: string; readonly oldProvinceName: string; readonly oldDistrictName: string; readonly whole: boolean };

const RENTED_AS: Readonly<Record<PropertyKind, string>> = {
  townhouse: 'nhà phố',
  apartment: 'căn hộ',
  villa: 'biệt thự',
  rooming_house: 'phòng trọ',
  commercial_space: 'mặt bằng',
  warehouse: 'kho xưởng',
  residential_land: 'đất ở',
  agricultural_land: 'đất nông nghiệp',
  mixed: 'nhà đất',
  other: 'nhà đất',
};

const distinct = (values: readonly string[]) => [...new Set(values)];

/** Đồng Nai became a city in 2026 under the same code, so "TP. Đồng Nai" and "Đồng Nai" name one place. */
const samePlace = (a: string, b: string) => a.replace(/^TP\. /u, '') === b.replace(/^TP\. /u, '');

const formerly = (names: readonly string[]) => (names.length === 0 ? '' : ` (${names.join(', ')} cũ)`);

/**
 * The household's topics (AGENT.md §5.2): one per province held and one per commune held, each under its current name
 * with the pre-2025 names people still use (Bình Dương for Dĩ An, Long An for Tân An), then the national topics.
 */
export function deriveResearchTopics(properties: readonly TopicProperty[], adminUnits: ReadonlyMap<string, string>, legacy: readonly LegacyUnit[]): ResearchTopic[] {
  const nameOf = (code: string) => adminUnits.get(code) ?? code;
  const wholeMergersInto = (communes: readonly string[]) => legacy.filter((unit) => unit.whole && communes.includes(unit.newCommuneCode));
  const ids = (held: readonly TopicProperty[]) => held.map((property) => property.id);

  const provinces = distinct(properties.map((property) => property.provinceCode)).toSorted().map((code): ResearchTopic => {
    const held = properties.filter((property) => property.provinceCode === code);
    const name = shortProvinceName(nameOf(code));
    const former = distinct(wholeMergersInto(held.map((property) => property.communeCode)).map((unit) => shortProvinceName(unit.oldProvinceName))).filter((old) => !samePlace(old, name));
    const rented = distinct(held.map((property) => RENTED_AS[property.kind])).join(', ');
    const queries = [name, ...former].flatMap((place) => [`bảng giá đất ${place}`, `quy hoạch ${place}`, `hạ tầng giao thông ${place} vành đai metro cao tốc`, `thị trường cho thuê ${rented} ${place}`]);
    return { key: `province:${code}`, label: `${name}${formerly(former)}`, query_templates: queries, province_codes: [code], property_ids: ids(held), source: 'auto' };
  });

  const communes = distinct(properties.map((property) => property.communeCode)).toSorted().map((code): ResearchTopic => {
    const held = properties.filter((property) => property.communeCode === code);
    const provinceCode = held[0]?.provinceCode ?? '';
    const province = shortProvinceName(nameOf(provinceCode));
    const commune = nameOf(code);
    const units = wholeMergersInto([code]);
    const former = distinct([...units.map((unit) => shortProvinceName(unit.oldDistrictName)), ...units.map((unit) => shortProvinceName(unit.oldProvinceName)).filter((old) => !samePlace(old, province))]);
    const area = former[0] ?? province;
    return {
      key: `commune:${code}`,
      label: `${commune}, ${province}${formerly(former)}`,
      query_templates: [`quy hoạch ${commune} ${area}`, `hạ tầng giao thông ${area} ${province}`],
      province_codes: [provinceCode],
      property_ids: ids(held),
      source: 'auto',
    };
  });

  const national = NATIONAL_TOPICS.map((topic): ResearchTopic => ({ ...topic, province_codes: [], property_ids: [], source: 'auto' }));
  return [...provinces, ...communes, ...national];
}
