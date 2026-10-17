import type { AnnotationKind, CertificateForm } from '../../../packages/core/src/agent-schemas/certificate_v1.ts';
import { isoDate, type IsoDate } from '../../../packages/core/src/index.ts';

export type HolderFacts = {
  readonly full_name: string;
  readonly birth_year: number | null;
  /** Synthetic and printed in full, so P2-03 can prove the reduction to `id_last4`. */
  readonly id_number: string;
  readonly address_text: string | null;
  readonly relation: string | null;
};

export type PurposeFacts = { readonly land_use_code: string; readonly area_m2: number; readonly term: string };

export type ParcelFacts = {
  readonly parcel_no: string | null;
  readonly map_sheet_no: string | null;
  readonly address_text: string;
  readonly area_m2: number;
  readonly use_form: string | null;
  readonly purposes: readonly PurposeFacts[];
  readonly origin_text: string | null;
};

export type StructureFacts = {
  readonly kind: string;
  readonly footprint_m2: number | null;
  readonly floor_area_m2: number | null;
  readonly floors: number | null;
  readonly structure_text: string | null;
  readonly completed_year: number | null;
  readonly ownership_term: string | null;
};

export type AnnotationFacts = { readonly date: IsoDate; readonly text: string; readonly kind: AnnotationKind };

export type CertificateFacts = {
  readonly form: CertificateForm;
  readonly holders: readonly HolderFacts[];
  readonly parcels: readonly ParcelFacts[];
  readonly structures: readonly StructureFacts[];
  readonly serial_no: string | null;
  readonly book_entry_no: string | null;
  readonly issued_on: IsoDate | null;
  readonly issued_by: string | null;
  readonly annotations: readonly AnnotationFacts[];
  readonly notes_text: string | null;
  readonly qr_payload: string | null;
};

export const SO_DO_PRE2009: CertificateFacts = {
  form: 'so_do_pre2009',
  holders: [
    {
      full_name: 'Trần Văn Demo Bình',
      birth_year: 1958,
      id_number: '079058004217',
      address_text: 'ấp Tân Phú, xã Tân Thông Hội, huyện Củ Chi, TP. Hồ Chí Minh',
      relation: null,
    },
  ],
  parcels: [
    {
      parcel_no: '245',
      map_sheet_no: '12',
      address_text: 'ấp Tân Phú, xã Tân Thông Hội, huyện Củ Chi, TP. Hồ Chí Minh',
      area_m2: 1250.5,
      use_form: 'Riêng',
      purposes: [
        { land_use_code: 'ONT', area_m2: 300, term: 'Lâu dài' },
        { land_use_code: 'CLN', area_m2: 950.5, term: 'Đến tháng 10/2043' },
      ],
      origin_text: 'Nhà nước công nhận quyền sử dụng đất',
    },
  ],
  structures: [],
  serial_no: 'Q 482915',
  book_entry_no: '01234 QSDĐ/123/QĐ-UB',
  issued_on: isoDate('2003-05-14'),
  issued_by: 'UBND huyện Củ Chi',
  annotations: [],
  notes_text: null,
  qr_payload: null,
};

export const SO_HONG_PRE2009: CertificateFacts = {
  form: 'so_hong_pre2009',
  holders: [
    {
      full_name: 'Phạm Minh Demo',
      birth_year: 1962,
      id_number: '079062118340',
      address_text: '12/45 đường Lê Văn Sỹ, phường 13, quận 3, TP. Hồ Chí Minh',
      relation: 'Vợ chồng',
    },
    {
      full_name: 'Nguyễn Thị Demo Lan',
      birth_year: 1965,
      id_number: '079165220913',
      address_text: '12/45 đường Lê Văn Sỹ, phường 13, quận 3, TP. Hồ Chí Minh',
      relation: 'Vợ chồng',
    },
  ],
  parcels: [
    {
      parcel_no: '87',
      map_sheet_no: '5',
      address_text: '12/45 đường Lê Văn Sỹ, phường 13, quận 3, TP. Hồ Chí Minh',
      area_m2: 68.4,
      use_form: 'Riêng',
      purposes: [{ land_use_code: 'ODT', area_m2: 68.4, term: 'Lâu dài' }],
      origin_text: null,
    },
  ],
  structures: [
    {
      kind: 'Nhà ở',
      footprint_m2: 68.4,
      floor_area_m2: 205.2,
      floors: 3,
      structure_text: 'Tường gạch, sàn bê tông cốt thép, mái tôn',
      completed_year: 2001,
      ownership_term: null,
    },
  ],
  serial_no: '0012345',
  book_entry_no: '5678/2004',
  issued_on: isoDate('2004-09-20'),
  issued_by: 'UBND TP. Hồ Chí Minh',
  annotations: [],
  notes_text: null,
  qr_payload: null,
};

export const GCN_2009_2024: CertificateFacts = {
  form: 'gcn_2009_2024',
  holders: [
    {
      full_name: 'Võ Thị Demo Mai',
      birth_year: 1971,
      id_number: '074171035582',
      address_text: 'phường Phú Hòa, thành phố Thủ Dầu Một, tỉnh Bình Dương',
      relation: null,
    },
  ],
  parcels: [
    {
      parcel_no: '1023',
      map_sheet_no: '34',
      address_text: 'phường Phú Hòa, thành phố Thủ Dầu Một, tỉnh Bình Dương',
      area_m2: 125.5,
      use_form: 'Sử dụng riêng',
      purposes: [{ land_use_code: 'ODT', area_m2: 125.5, term: 'Lâu dài' }],
      origin_text: 'Nhận chuyển nhượng đất được Công nhận QSDĐ như giao đất có thu tiền sử dụng đất',
    },
  ],
  structures: [
    {
      kind: 'Nhà ở riêng lẻ',
      footprint_m2: 98.2,
      floor_area_m2: 196.4,
      floors: 2,
      structure_text: 'Bê tông cốt thép',
      completed_year: 2016,
      ownership_term: 'Lâu dài',
    },
  ],
  serial_no: 'CS 254817',
  book_entry_no: 'CS 01234',
  issued_on: isoDate('2018-03-12'),
  issued_by: 'Sở Tài nguyên và Môi trường tỉnh Bình Dương',
  annotations: [
    {
      date: isoDate('2020-06-15'),
      text: 'Thế chấp bằng quyền sử dụng đất và tài sản gắn liền với đất tại Ngân hàng TMCP Demo theo hợp đồng số 123/2020/HĐTC',
      kind: 'mortgage',
    },
    { date: isoDate('2023-08-01'), text: 'Xóa thế chấp theo hợp đồng số 123/2020/HĐTC', kind: 'mortgage_release' },
  ],
  notes_text: null,
  qr_payload: null,
};

export const GCN_2024: CertificateFacts = {
  form: 'gcn_2024',
  holders: [
    {
      full_name: 'Đặng Quốc Demo',
      birth_year: 1984,
      id_number: '079084301776',
      address_text: 'phường An Phú, thành phố Thủ Đức, Thành phố Hồ Chí Minh',
      relation: null,
    },
    {
      full_name: 'Huỳnh Ngọc Demo Thảo',
      birth_year: 1987,
      id_number: '079187402658',
      address_text: 'phường An Phú, thành phố Thủ Đức, Thành phố Hồ Chí Minh',
      relation: null,
    },
  ],
  parcels: [
    {
      parcel_no: '56',
      map_sheet_no: '18',
      address_text: 'phường An Phú, thành phố Thủ Đức, Thành phố Hồ Chí Minh',
      area_m2: 82.7,
      use_form: 'Sử dụng chung',
      purposes: [{ land_use_code: 'ODT', area_m2: 82.7, term: 'Lâu dài' }],
      origin_text: 'Nhận chuyển nhượng quyền sử dụng đất',
    },
  ],
  structures: [
    {
      kind: 'Nhà ở riêng lẻ',
      footprint_m2: 80.1,
      floor_area_m2: 320.4,
      floors: 4,
      structure_text: 'Khung bê tông cốt thép, tường gạch, mái bê tông',
      completed_year: 2022,
      ownership_term: 'Lâu dài',
    },
  ],
  serial_no: 'AA 01234567',
  book_entry_no: 'DT 00456',
  issued_on: isoDate('2024-11-05'),
  issued_by: 'Văn phòng đăng ký đất đai Thành phố Hồ Chí Minh',
  annotations: [],
  notes_text: 'Thửa đất có 12,3 m² thuộc hành lang lộ giới đường Demo.',
  qr_payload: 'GCN-DEMO:AA01234567:T56:TBD18',
};

export const PAPER_ONLY: CertificateFacts = {
  form: 'paper_only',
  holders: [
    {
      full_name: 'Trương Thị Demo Hạnh',
      birth_year: 1979,
      id_number: '080179553104',
      address_text: 'ấp 3, xã Mỹ Yên, huyện Bến Lức, tỉnh Long An',
      relation: null,
    },
  ],
  parcels: [
    {
      parcel_no: '312',
      map_sheet_no: '7',
      address_text: 'ấp 3, xã Mỹ Yên, huyện Bến Lức, tỉnh Long An',
      area_m2: 100,
      use_form: null,
      purposes: [],
      origin_text: null,
    },
  ],
  structures: [],
  serial_no: null,
  book_entry_no: null,
  issued_on: null,
  issued_by: null,
  annotations: [],
  notes_text: null,
  qr_payload: null,
};

export const NORTHSTAR_DI_AN: CertificateFacts = {
  form: 'gcn_2009_2024',
  holders: [
    {
      full_name: 'Nguyễn Thị Demo',
      birth_year: 1960,
      id_number: '074160018829',
      address_text: 'phường Dĩ An, thành phố Dĩ An, tỉnh Bình Dương',
      relation: null,
    },
  ],
  parcels: [
    {
      parcel_no: '903',
      map_sheet_no: '41',
      address_text: 'phường Dĩ An, thành phố Dĩ An, tỉnh Bình Dương',
      area_m2: 312.8,
      use_form: 'Sử dụng riêng',
      purposes: [
        { land_use_code: 'ODT', area_m2: 150, term: 'Lâu dài' },
        { land_use_code: 'CLN', area_m2: 162.8, term: 'Đến ngày 15/10/2064' },
      ],
      origin_text: 'Nhận chuyển nhượng đất được Công nhận QSDĐ như giao đất có thu tiền sử dụng đất',
    },
  ],
  structures: [
    {
      kind: 'Nhà ở riêng lẻ',
      footprint_m2: 240,
      floor_area_m2: 240,
      floors: 1,
      structure_text: 'Tường gạch, mái tôn, nền gạch men',
      completed_year: 2015,
      ownership_term: 'Lâu dài',
    },
  ],
  serial_no: 'CĐ 718204',
  book_entry_no: 'CS 07712',
  issued_on: isoDate('2016-10-15'),
  issued_by: 'Sở Tài nguyên và Môi trường tỉnh Bình Dương',
  annotations: [],
  notes_text: null,
  qr_payload: null,
};
