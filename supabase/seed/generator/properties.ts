import { publicTable } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';

type CurrentAddress = {
  house_no?: string;
  street: string;
  commune_code: string;
  province_code: string;
};

type PropertySeedShape = {
  key: string;
  nickname: string;
  kind: string;
  kind_details: Record<string, string | number>;
  use_mode: string;
  legal_status: string;
  address: CurrentAddress;
  certificate_address_text: string;
  lat: number;
  lng: number;
};

export const PROPERTY_SEEDS = [
  {
    key: 'q7',
    nickname: 'Nhà phố Q7',
    kind: 'townhouse',
    kind_details: {},
    use_mode: 'rental',
    legal_status: 'certified',
    address: { house_no: '25', street: 'Đường số 15', commune_code: '27475', province_code: '79' },
    certificate_address_text: 'Số 25 đường số 15, Khu phố 1, Phường Tân Phong, Quận 7, Thành phố Hồ Chí Minh',
    lat: 10.7295,
    lng: 106.7058,
  },
  {
    key: 'thu-duc',
    nickname: 'Căn hộ Thủ Đức',
    kind: 'apartment',
    kind_details: {
      building_name: 'Chung cư Demo Bình Thọ',
      block: 'A',
      floor: 12,
      unit_no: 'A-12.05',
      management_fee_vnd: 1_200_000,
    },
    use_mode: 'rental',
    legal_status: 'certified',
    address: { house_no: '2', street: 'Đường Võ Văn Ngân', commune_code: '26824', province_code: '79' },
    certificate_address_text:
      'Căn hộ A-12.05, Chung cư Demo Bình Thọ, số 2 đường Võ Văn Ngân, Phường Bình Thọ, Thành phố Thủ Đức, Thành phố Hồ Chí Minh',
    lat: 10.8497,
    lng: 106.7717,
  },
  {
    key: 'di-an',
    nickname: 'Dãy trọ Dĩ An',
    kind: 'rooming_house',
    kind_details: { room_count: 8 },
    use_mode: 'rental',
    legal_status: 'certified',
    address: { house_no: '18/3', street: 'Đường Nguyễn An Ninh', commune_code: '25942', province_code: '79' },
    certificate_address_text: 'Số 18/3 đường Nguyễn An Ninh, Khu phố Nhị Đồng 2, Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương',
    lat: 10.9068,
    lng: 106.769,
  },
  {
    key: 'q1',
    nickname: 'Mặt bằng Quận 1',
    kind: 'commercial_space',
    kind_details: {},
    use_mode: 'rental',
    legal_status: 'certified',
    address: { house_no: '40', street: 'Đường Lê Thánh Tôn', commune_code: '26740', province_code: '79' },
    certificate_address_text: 'Số 40 đường Lê Thánh Tôn, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh',
    lat: 10.778,
    lng: 106.702,
  },
  {
    key: 'bien-hoa',
    nickname: 'Kho Biên Hòa',
    kind: 'warehouse',
    kind_details: {},
    use_mode: 'rental',
    legal_status: 'certified',
    address: { house_no: 'Lô C5', street: 'Đường số 7', commune_code: '26188', province_code: '75' },
    certificate_address_text: 'Lô C5, đường số 7, Khu phố 3, Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai',
    lat: 10.97,
    lng: 106.846,
  },
  {
    key: 'long-an',
    nickname: 'Đất vườn Long An',
    kind: 'agricultural_land',
    kind_details: { frontage_m: 25, road_width_m: 4 },
    use_mode: 'held',
    legal_status: 'certified',
    address: { street: 'Đường Châu Thị Kim', commune_code: '27694', province_code: '80' },
    certificate_address_text: 'Thửa đất số 112, tờ bản đồ số 9, Phường 2, Thành phố Tân An, Tỉnh Long An',
    lat: 10.533,
    lng: 106.405,
  },
  {
    key: 'bao-loc',
    nickname: 'Đất Bảo Lộc',
    kind: 'residential_land',
    kind_details: { frontage_m: 8, road_width_m: 6 },
    use_mode: 'held',
    legal_status: 'certified',
    address: { house_no: '7', street: 'Đường Trần Phú', commune_code: '24823', province_code: '68' },
    certificate_address_text: 'Số 7 đường Trần Phú, Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng',
    lat: 11.547,
    lng: 107.808,
  },
] as const satisfies readonly PropertySeedShape[];

export type PropertySeed = (typeof PROPERTY_SEEDS)[number];
export type PropertySeedKey = PropertySeed['key'];

export function propertyCode(key: PropertySeedKey): string {
  return key.replaceAll('-', '').toUpperCase();
}

function currentAddress({ house_no, street, commune_code, province_code }: CurrentAddress) {
  const line = house_no === undefined ? street : `${house_no} ${street}`;
  return { ...(house_no === undefined ? {} : { house_no }), street, commune_code, province_code, line };
}

export const properties = publicTable('properties', ({ household, properties }) =>
  properties.map((seed) => ({
    id: seedId(`seed:property:${household.key}:${seed.key}`),
    household_id: householdId(household),
    nickname: seed.nickname,
    code: propertyCode(seed.key),
    kind: seed.kind,
    kind_details: seed.kind_details,
    use_mode: seed.use_mode,
    legal_status: seed.legal_status,
    current_address: currentAddress(seed.address),
    certificate_address_text: seed.certificate_address_text,
    location: `SRID=4326;POINT(${seed.lng} ${seed.lat})`,
  })),
);
