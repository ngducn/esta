import { describe, expect, it } from 'vitest';
import { normalizeValue, scoreExtraction } from './score';

const leaf = (value: unknown, confidence = 1) => ({ value, confidence, page: 1 });

function certificate(overrides: Record<string, unknown> = {}) {
  return {
    form: leaf('gcn_2009_2024'),
    holders: [{ full_name: leaf('Võ Thị Demo Mai'), birth_year: leaf(1971), id_last4: leaf('5582'), address_text: leaf(null), relation: leaf(null) }],
    parcels: [
      {
        parcel_no: leaf('1023'),
        map_sheet_no: leaf('34'),
        address_text: leaf('phường Phú Hòa, thành phố Thủ Dầu Một, tỉnh Bình Dương'),
        area_m2: leaf(125.5),
        use_form: leaf('Sử dụng riêng'),
        purposes: [{ land_use_code: leaf('ODT'), area_m2: leaf(125.5), term: leaf('Lâu dài') }],
        origin_text: leaf(null),
      },
    ],
    structures: [],
    serial_no: leaf('CS 254817'),
    book_entry_no: leaf('CS 01234'),
    issued_on: leaf('2026-10-07'),
    issued_by: leaf('Sở Tài nguyên và Môi trường tỉnh Bình Dương'),
    annotations: [],
    has_qr: leaf(false),
    notes_text: leaf(null),
    ...overrides,
  };
}

const truth = certificate();

function hitOf(result: unknown, field: string): boolean | undefined {
  return scoreExtraction('certificate_v1', truth, result).required.find((score) => score.field === field)?.hit;
}

describe('scoreExtraction', () => {
  it('scores an exact copy as valid with every required field hit', () => {
    const score = scoreExtraction('certificate_v1', truth, certificate());
    expect(score.schemaValid).toBe(true);
    expect(score.required.every((field) => field.hit)).toBe(true);
    expect(score.required).toHaveLength(7);
  });

  it('matches 125,5 m² to an area of 125.5', () => {
    const parcels = [{ ...truth.parcels[0], area_m2: leaf('125,5 m²') }];
    expect(hitOf(certificate({ parcels }), 'parcels[].area_m2')).toBe(true);
  });

  it('matches an NFD holder name to its NFC truth', () => {
    const nfd = 'Võ Thị Demo Mai'.normalize('NFD');
    expect(nfd).not.toBe('Võ Thị Demo Mai');
    const holders = [{ ...truth.holders[0], full_name: leaf(nfd) }];
    expect(hitOf(certificate({ holders }), 'holders[].full_name')).toBe(true);
  });

  it('matches 07/10/2026 to 2026-10-07', () => {
    expect(normalizeValue('issued_on', '07/10/2026')).toBe('2026-10-07');
  });

  it.each(['0903123456', '0903 123 456', '0903.123.456', '+84 903 123 456'])('matches a phone printed %s to its E.164 truth', (printed) => {
    expect(normalizeValue('tenant_phone', printed)).toBe(normalizeValue('tenant_phone', '+84903123456'));
  });

  it('counts a missing field as a miss', () => {
    const { serial_no: _dropped, ...withoutSerial } = certificate();
    expect(hitOf(withoutSerial, 'serial_no')).toBe(false);
    expect(hitOf(certificate({ serial_no: leaf(null) }), 'serial_no')).toBe(false);
  });

  it('lets an extra confident holder lower precision and miss the holder names', () => {
    const extra = { full_name: leaf('Lê Văn Demo Khác', 0.95), birth_year: leaf(null, 0.5), id_last4: leaf(null, 0.5), address_text: leaf(null, 0.5), relation: leaf(null, 0.5) };
    const result = certificate({ holders: [...truth.holders, extra] });
    const exact = scoreExtraction('certificate_v1', truth, certificate()).highConfidence;
    const score = scoreExtraction('certificate_v1', truth, result);
    expect(score.highConfidence.total).toBe(exact.total + 1);
    expect(score.highConfidence.correct).toBe(exact.correct);
    expect(score.required.find((field) => field.field === 'holders[].full_name')?.hit).toBe(false);
  });

  it('counts confidence of exactly 0.9 as high confidence and 0.89 as not', () => {
    const at = scoreExtraction('certificate_v1', truth, certificate({ serial_no: leaf('CS 999999', 0.9) })).highConfidence;
    const below = scoreExtraction('certificate_v1', truth, certificate({ serial_no: leaf('CS 999999', 0.89) })).highConfidence;
    expect(at.total - at.correct).toBe(1);
    expect(below.total - below.correct).toBe(0);
    expect(at.total).toBe(below.total + 1);
  });

  it('upper-cases land use codes before comparing', () => {
    const parcels = [{ ...truth.parcels[0], purposes: [{ land_use_code: leaf('odt'), area_m2: leaf(125.5), term: leaf('Lâu dài') }] }];
    const score = scoreExtraction('certificate_v1', truth, certificate({ parcels }));
    expect(score.highConfidence.correct).toBe(score.highConfidence.total);
  });

  it('zeroes every hit when the schema rejects the reply', () => {
    const score = scoreExtraction('certificate_v1', truth, certificate({ form: leaf('so_trang') }));
    expect(score.schemaValid).toBe(false);
    expect(score.required.some((field) => field.hit)).toBe(false);
  });

  it('reports null-truth slots as their own count, apart from required', () => {
    const paperOnly = certificate({ serial_no: leaf(null), issued_on: leaf(null) });
    const exact = scoreExtraction('certificate_v1', paperOnly, paperOnly);
    expect(exact.required).toHaveLength(5);
    expect(exact.required.every((field) => field.hit)).toBe(true);
    expect(exact.nullTruth).toEqual([
      { field: 'issued_on', hit: true },
      { field: 'serial_no', hit: true },
    ]);
  });

  it('scores an empty reply 0 of 5 required and 0 null-truth hits', () => {
    const paperOnly = certificate({ serial_no: leaf(null), issued_on: leaf(null) });
    const score = scoreExtraction('certificate_v1', paperOnly, {});
    expect(score.required.filter((field) => field.hit)).toHaveLength(0);
    expect(score.nullTruth.filter((field) => field.hit)).toHaveLength(0);
  });
});
