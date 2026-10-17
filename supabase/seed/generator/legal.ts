import { publicTable, type HouseholdSeed } from './context.ts';
import { householdId, personKey, type Person } from './households.ts';
import { seedId } from './ids.ts';
import { bankPartyId } from './parties.ts';
import type { PropertySeedKey } from './properties.ts';

type Purpose = { land_use_code: string; area_m2?: number; term?: string };
type ParcelSeed = { parcel_no: string | null; map_sheet_no: string | null; area_m2: number | null; use_form: 'private' | 'shared' | null; purposes: Purpose[] };
type StructureSeed = { kind: string; footprint_m2: number | null; floor_area_m2: number | null; floors: number | null; completed_year: number | null; onCertificate: boolean };
type LegalSeed = {
  form: string;
  serial_no: string | null;
  issued_on: string | null;
  issued_by: string | null;
  /** SPEC §9.3 ownership. */
  holders: readonly Person[];
  mortgage: { amount_vnd: number; registered_on: string } | null;
  parcels: readonly ParcelSeed[];
  structures: readonly StructureSeed[];
};

const residential = (area_m2: number): Purpose[] => [{ land_use_code: 'ODT', area_m2, term: 'long_term' }];

export const LEGAL_SEEDS: Record<PropertySeedKey, LegalSeed> = {
  q7: {
    form: 'so_hong_pre2009',
    serial_no: 'AĐ 901001',
    issued_on: '2006-08-14',
    issued_by: 'UBND Quận 7',
    holders: ['me'],
    mortgage: null,
    parcels: [{ parcel_no: '125', map_sheet_no: '31', area_m2: 80, use_form: 'private', purposes: residential(80) }],
    structures: [{ kind: 'Nhà ở riêng lẻ', footprint_m2: 80, floor_area_m2: 240, floors: 3, completed_year: 2004, onCertificate: true }],
  },
  'thu-duc': {
    form: 'gcn_2009_2024',
    serial_no: 'CĐ 902002',
    issued_on: '2019-11-20',
    issued_by: 'Sở Tài nguyên và Môi trường Thành phố Hồ Chí Minh',
    holders: ['me', 'ryan'],
    mortgage: null,
    parcels: [{ parcel_no: '58', map_sheet_no: '12', area_m2: null, use_form: 'shared', purposes: [{ land_use_code: 'ODT', term: 'long_term' }] }],
    structures: [{ kind: 'Căn hộ chung cư', footprint_m2: null, floor_area_m2: 72.5, floors: null, completed_year: 2018, onCertificate: true }],
  },
  'di-an': {
    form: 'gcn_2024',
    serial_no: 'DA 903003',
    issued_on: '2024-12-05',
    issued_by: 'Sở Tài nguyên và Môi trường tỉnh Bình Dương',
    holders: ['me'],
    mortgage: null,
    parcels: [{ parcel_no: '903', map_sheet_no: '45', area_m2: 210.5, use_form: 'private', purposes: residential(210.5) }],
    structures: [{ kind: 'Dãy nhà trọ', footprint_m2: 180, floor_area_m2: 180, floors: 1, completed_year: 2016, onCertificate: true }],
  },
  q1: {
    form: 'gcn_2009_2024',
    serial_no: 'BĐ 904004',
    issued_on: '2010-04-02',
    issued_by: 'UBND Quận 1',
    holders: ['me'],
    mortgage: null,
    parcels: [{ parcel_no: '18', map_sheet_no: '7', area_m2: 95.4, use_form: 'private', purposes: residential(95.4) }],
    structures: [{ kind: 'Nhà ở riêng lẻ', footprint_m2: 95.4, floor_area_m2: 286.2, floors: 3, completed_year: 1998, onCertificate: true }],
  },
  'bien-hoa': {
    form: 'so_do_pre2009',
    serial_no: 'AB 905005',
    issued_on: '2003-06-30',
    issued_by: 'UBND tỉnh Đồng Nai',
    holders: ['me', 'ryan'],
    mortgage: null,
    parcels: [{ parcel_no: '95', map_sheet_no: '22', area_m2: 1200, use_form: 'private', purposes: [{ land_use_code: 'SKC', area_m2: 1200, term: '2053-06-30' }] }],
    structures: [{ kind: 'Nhà kho', footprint_m2: 900, floor_area_m2: 900, floors: 1, completed_year: 2010, onCertificate: false }],
  },
  'long-an': {
    form: 'paper_only',
    serial_no: null,
    issued_on: null,
    issued_by: null,
    holders: ['ryan'],
    mortgage: null,
    parcels: [{ parcel_no: null, map_sheet_no: null, area_m2: null, use_form: null, purposes: [] }],
    structures: [],
  },
  'bao-loc': {
    form: 'gcn_2009_2024',
    serial_no: 'CS 907007',
    issued_on: '2021-01-15',
    issued_by: 'Sở Tài nguyên và Môi trường tỉnh Lâm Đồng',
    holders: ['me'],
    mortgage: { amount_vnd: 2_000_000_000, registered_on: '2024-03-12' },
    parcels: [{ parcel_no: '211', map_sheet_no: '18', area_m2: 150, use_form: 'private', purposes: residential(150) }],
    structures: [],
  },
};

const certificateId = (household: HouseholdSeed, key: PropertySeedKey) => seedId(`seed:certificate:${household.key}:${key}`);
const propertyId = (household: HouseholdSeed, key: PropertySeedKey) => seedId(`seed:property:${household.key}:${key}`);

export const certificates = publicTable('certificates', ({ household, properties }) =>
  properties.map(({ key }) => {
    const seed = LEGAL_SEEDS[key];
    return {
      id: certificateId(household, key),
      household_id: householdId(household),
      property_id: propertyId(household, key),
      form: seed.form,
      serial_no: seed.serial_no,
      issued_on: seed.issued_on,
      issued_by: seed.issued_by,
      holder_party_ids: seed.holders.map((person) => seedId(`seed:party:${personKey(person, household)}`)),
      status: seed.mortgage === null ? 'valid' : 'mortgaged',
      mortgage: seed.mortgage === null ? null : { bank_party_id: bankPartyId(household), ...seed.mortgage },
    };
  }),
);

export const parcels = publicTable('parcels', ({ household, properties }) =>
  properties.flatMap(({ key }) =>
    LEGAL_SEEDS[key].parcels.map(({ purposes, ...parcel }, index) => ({
      id: seedId(`seed:parcel:${household.key}:${key}:${index + 1}`),
      household_id: householdId(household),
      property_id: propertyId(household, key),
      certificate_id: certificateId(household, key),
      ...parcel,
      // renderSeed writes a JS array as a Postgres array, so the jsonb array goes in as its JSON text.
      purposes: JSON.stringify(purposes),
    })),
  ),
);

export const structures = publicTable('structures', ({ household, properties }) =>
  properties.flatMap(({ key }) =>
    LEGAL_SEEDS[key].structures.map(({ onCertificate, ...structure }, index) => ({
      id: seedId(`seed:structure:${household.key}:${key}:${index + 1}`),
      household_id: householdId(household),
      property_id: propertyId(household, key),
      certificate_id: onCertificate ? certificateId(household, key) : null,
      ...structure,
    })),
  ),
);
