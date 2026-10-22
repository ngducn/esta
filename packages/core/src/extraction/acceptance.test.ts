import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import billFile from '../../../../fixtures/utility-bills/electricity-q7-scan/truth.json';
import truthFile from '../../../../fixtures/certificates/gcn_2024-photo/truth.json';
import { NATIONAL_ID_VECTORS } from '../agent-schemas/national-id-vectors';
import { reduceNationalIds } from '../agent-schemas/reduce-national-ids';
import {
  planCertificateAcceptance,
  planLeaseAcceptance,
  readValues,
  planUtilityBillAcceptance,
  rowId,
  type AcceptanceExtraction,
  type Decisions,
  type PlanResult,
} from './acceptance';
import { reviewFields } from './fields';

const extraction: AcceptanceExtraction = {
  id: '00000000-0000-4000-8000-0000000000e1',
  householdId: '00000000-0000-4000-8000-0000000000a0',
  propertyId: '00000000-0000-4000-8000-0000000000b0',
  documentId: '00000000-0000-4000-8000-0000000000d0',
  result: truthFile.certificate,
};

const none = { parties: [], accounts: [] };

const FIXTURES = join(import.meta.dirname, '../../../../fixtures/certificates');
const truths = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'generator')
  .map((entry) => ({ id: entry.name, certificate: (JSON.parse(readFileSync(join(FIXTURES, entry.name, 'truth.json'), 'utf8')) as { certificate: unknown }).certificate }));

const acceptAll = (result: unknown, schema: 'certificate_v1' | 'utility_bill_v1' = 'certificate_v1'): Record<string, Decisions[string]> =>
  Object.fromEntries(reviewFields(schema, result).map((field) => [field.path, { kind: 'accepted' as const }]));

function planOf(result: PlanResult) {
  if (!result.ok) throw new Error(`${result.reason}: ${result.paths.join(', ')}`);
  return result.plan;
}

const tables = (result: PlanResult) => planOf(result).steps.map((step) => step.table);
const rowsOf = <T extends string>(result: PlanResult, table: T) =>
  planOf(result).steps.filter((step) => step.table === table).map((step) => step.row as unknown as Record<string, unknown>);

describe('planCertificateAcceptance', () => {
  it('plans the gcn_2024 truth: two new owners, the certificate, its parcel and structure, then the address', () => {
    const result = planCertificateAcceptance(extraction, acceptAll(extraction.result), none);
    expect(tables(result)).toEqual(['parties', 'parties', 'certificates', 'parcels', 'structures', 'properties']);
    const [certificate] = rowsOf(result, 'certificates');
    expect(certificate).toMatchObject({
      id: rowId(extraction.id, 'certificate'),
      household_id: extraction.householdId,
      property_id: extraction.propertyId,
      form: 'gcn_2024',
      serial_no: 'AA 01234567',
      issued_on: '2024-11-05',
      document_id: extraction.documentId,
      extraction_id: extraction.id,
      holder_party_ids: [rowId(extraction.id, 'holders[0]'), rowId(extraction.id, 'holders[1]')],
    });
    expect(rowsOf(result, 'parcels')).toEqual([
      {
        id: rowId(extraction.id, 'parcels[0]'),
        household_id: extraction.householdId,
        property_id: extraction.propertyId,
        certificate_id: rowId(extraction.id, 'certificate'),
        parcel_no: '56',
        map_sheet_no: '18',
        area_m2: 82.7,
        use_form: 'shared',
        purposes: [{ land_use_code: 'ODT', area_m2: 82.7, term: 'long_term' }],
        origin_text: 'Nhận chuyển nhượng quyền sử dụng đất',
      },
    ]);
    expect(rowsOf(result, 'parties')[0]).toMatchObject({ full_name: 'Đặng Quốc Demo', id_last4: '1776', tags: ['owner'], kind: 'individual' });
    expect(rowsOf(result, 'properties')).toEqual([
      { id: extraction.propertyId, household_id: extraction.householdId, certificate_address_text: 'phường An Phú, thành phố Thủ Đức, Thành phố Hồ Chí Minh' },
    ]);
    for (const step of planOf(result).steps) expect(step.row.household_id).toBe(extraction.householdId);
  });

  it('plans identical rows and ids when run twice', () => {
    const decisions = acceptAll(extraction.result);
    expect(planCertificateAcceptance(extraction, decisions, none)).toEqual(planCertificateAcceptance(extraction, decisions, none));
  });

  it('writes an edited value over the one read and records the field as edited', () => {
    const result = planCertificateAcceptance(extraction, { ...acceptAll(extraction.result), 'parcels[0].area_m2': { kind: 'edited', value: '125,5' } }, none);
    expect(rowsOf(result, 'parcels')[0]?.area_m2).toBe(125.5);
    expect(planOf(result).acceptedFields['parcels[0].area_m2']).toEqual({ decision: 'edited', value: 125.5 });
    expect(planOf(result).acceptedFields['parcels[0].parcel_no']).toEqual({ decision: 'accepted', value: '56' });
  });

  it('leaves out every field without a decision', () => {
    const { 'serial_no': _serial, 'structures[0].kind': _kind, ...rest } = acceptAll(extraction.result);
    const decisions = Object.fromEntries(Object.entries(rest).filter(([path]) => !path.startsWith('structures[0]')));
    const result = planCertificateAcceptance(extraction, decisions, none);
    expect(rowsOf(result, 'certificates')[0]?.serial_no).toBeNull();
    expect(tables(result)).not.toContain('structures');
    expect(planOf(result).acceptedFields).not.toHaveProperty('serial_no');
  });

  it('asks for the field a row needs when the row has other values', () => {
    const { form: _form, ...withoutForm } = acceptAll(extraction.result);
    expect(planCertificateAcceptance(extraction, withoutForm, none)).toEqual({ ok: false, reason: 'missing', paths: ['form'] });
    const { 'structures[0].kind': _kind, ...withoutKind } = acceptAll(extraction.result);
    expect(planCertificateAcceptance(extraction, withoutKind, none)).toEqual({ ok: false, reason: 'missing', paths: ['structures[0].kind'] });
  });

  it('refuses an edit that does not read as its kind', () => {
    const result = planCertificateAcceptance(extraction, { ...acceptAll(extraction.result), 'parcels[0].area_m2': { kind: 'edited', value: 'một trăm' } }, none);
    expect(result).toEqual({ ok: false, reason: 'invalid', paths: ['parcels[0].area_m2'] });
  });

  it('reuses a party with the same normalized name and id_last4 and never rewrites it', () => {
    const existing = { id: '00000000-0000-4000-8000-00000000aa01', fullName: 'ĐẶNG  QUỐC demo', idLast4: '1776' };
    const sameNameOtherId = { id: '00000000-0000-4000-8000-00000000aa02', fullName: 'Huỳnh Ngọc Demo Thảo', idLast4: '0000' };
    const result = planCertificateAcceptance(extraction, acceptAll(extraction.result), { parties: [existing, sameNameOtherId] });
    expect(rowsOf(result, 'parties').map((row) => row.full_name)).toEqual(['Huỳnh Ngọc Demo Thảo']);
    expect(rowsOf(result, 'certificates')[0]?.holder_party_ids).toEqual([existing.id, rowId(extraction.id, 'holders[1]')]);
  });

  it('keeps a full ID typed in a text field as typed, and only the last four in the holder ID field (DOC-6, D11)', () => {
    const result = planCertificateAcceptance(
      extraction,
      {
        ...acceptAll(extraction.result),
        'holders[0].id_last4': { kind: 'edited', value: '079184001776' },
        'holders[0].address_text': { kind: 'edited', value: 'CCCD 079184001776, phường An Phú' },
        'parcels[0].origin_text': { kind: 'edited', value: 'Nhận chuyển nhượng từ ông Demo, số định danh 079 184 001 777' },
      },
      none,
    );
    expect(rowsOf(result, 'parties')[0]).toMatchObject({ id_last4: '1776', address_text: 'CCCD 079184001776, phường An Phú' });
    expect(rowsOf(result, 'parcels')[0]?.origin_text).toBe('Nhận chuyển nhượng từ ông Demo, số định danh 079 184 001 777');
    expect(planOf(result).acceptedFields['holders[0].address_text']).toEqual({ decision: 'edited', value: 'CCCD 079184001776, phường An Phú' });
    expect(planOf(result).acceptedFields['holders[0].id_last4']).toEqual({ decision: 'edited', value: '1776' });
  });

  it('plans every field of each of the 16 certificate truths accepted as read', () => {
    expect(truths).toHaveLength(16);
    for (const { id, certificate } of truths) {
      const result = planCertificateAcceptance({ ...extraction, result: certificate }, acceptAll(certificate), none);
      expect(result.ok ? 'ok' : `${result.reason}: ${result.paths.join(', ')}`, id).toBe('ok');
    }
  });

  it('stores a pre-2009 term printed to the month as the last day of that month', () => {
    const certificate = truths.find(({ id }) => id === 'so_do_pre2009-photo')?.certificate;
    const result = planCertificateAcceptance({ ...extraction, result: certificate }, acceptAll(certificate), none);
    expect(rowsOf(result, 'parcels')[0]?.purposes).toEqual([
      { land_use_code: 'ONT', area_m2: 300, term: 'long_term' },
      { land_use_code: 'CLN', area_m2: 950.5, term: '2043-10-31' },
    ]);
  });

  it.each(NATIONAL_ID_VECTORS.squeezed)('stores the shared vector %s by its last four digits when read, and as typed when typed (D11)', (_name, text, stored) => {
    const asTyped = text.replace(/\s+/gu, ' ').trim();
    const typed = planCertificateAcceptance(
      extraction,
      { ...acceptAll(extraction.result), issued_by: { kind: 'edited', value: text }, 'parcels[0].origin_text': { kind: 'edited', value: text } },
      none,
    );
    const certificate = truthFile.certificate;
    const read = reduceNationalIds({
      ...certificate,
      issued_by: { ...certificate.issued_by, value: text },
      parcels: [{ ...certificate.parcels[0], origin_text: { ...certificate.parcels[0]?.origin_text, value: text } }],
    });
    const accepted = planCertificateAcceptance({ ...extraction, result: read }, acceptAll(read), none);
    for (const [result, value] of [[typed, asTyped], [accepted, stored]] as const) {
      expect(rowsOf(result, 'certificates')[0]?.issued_by).toBe(value);
      expect(rowsOf(result, 'parcels')[0]?.origin_text).toBe(value);
      expect(planOf(result).acceptedFields.issued_by?.value).toBe(value);
      expect(planOf(result).acceptedFields['parcels[0].origin_text']?.value).toBe(value);
    }
    expect(asTyped).not.toBe(stored);
  });

  it.each([
    ['parcels[0].area_m2', '0791234567,89'],
    ['parcels[0].area_m2', '001123456789'],
    ['parcels[0].area_m2', '9999999999,99'],
    ['structures[0].floor_area_m2', '001123456789'],
    ['structures[0].footprint_m2', '0791234567,89 m²'],
  ])('reads %s typed as %s as the number typed, refused past its bounds (D11)', (path, value) => {
    const result = planCertificateAcceptance(extraction, { ...acceptAll(extraction.result), [path]: { kind: 'edited', value } }, none);
    expect(result).toEqual({ ok: false, reason: 'out_of_range', paths: [path] });
  });

  it.each([
    ['parcels[0].area_m2', '123456789'],
    ['parcels[0].purposes[0].area_m2', '100000000,01'],
    ['structures[0].floor_area_m2', '100.000.001'],
    ['structures[0].completed_year', '2101'],
    ['structures[0].completed_year', '1799'],
  ])('refuses %s typed as %s, outside the bounds the assistant itself must keep', (path, value) => {
    const result = planCertificateAcceptance(extraction, { ...acceptAll(extraction.result), [path]: { kind: 'edited', value } }, none);
    expect(result).toEqual({ ok: false, reason: 'out_of_range', paths: [path] });
  });

  it('keeps an area of exactly 100.000.000 m² and the year 2100', () => {
    const typed = { 'parcels[0].area_m2': '100.000.000', 'structures[0].completed_year': '2100' };
    const edits = Object.fromEntries(Object.entries(typed).map(([path, value]) => [path, { kind: 'edited' as const, value }]));
    const result = planCertificateAcceptance(extraction, { ...acceptAll(extraction.result), ...edits }, none);
    expect(rowsOf(result, 'parcels')[0]?.area_m2).toBe(100_000_000);
    expect(rowsOf(result, 'structures')[0]?.completed_year).toBe(2100);
  });

  it('stores the end of a term range, month or full date', () => {
    for (const [typed, term] of [['Từ tháng 10/1993 đến tháng 10/2043', '2043-10-31'], ['Từ 15/10/1993 đến 15/10/2043', '2043-10-15']] as const) {
      const result = planCertificateAcceptance(extraction, { ...acceptAll(extraction.result), 'parcels[0].purposes[0].term': { kind: 'edited', value: typed } }, none);
      expect(rowsOf(result, 'parcels')[0]?.purposes, typed).toEqual([{ land_use_code: 'ODT', area_m2: 82.7, term }]);
    }
  });

  it('lists only the values the assistant read, each with its field, for the database to judge (D11)', () => {
    const [[, origin], [, issuer]] = [NATIONAL_ID_VECTORS.refused[0] ?? ['', ''], NATIONAL_ID_VECTORS.refused[3] ?? ['', '']];
    const plan = planOf(
      planCertificateAcceptance(
        extraction,
        { ...acceptAll(extraction.result), 'parcels[0].origin_text': { kind: 'edited', value: origin }, issued_by: { kind: 'edited', value: issuer } },
        none,
      ),
    );
    const values = readValues(plan);
    expect(values).toContainEqual({ path: 'parcels[0].area_m2', value: 82.7 });
    expect(values.map(({ path }) => path)).not.toContain('parcels[0].origin_text');
    expect(values.map(({ path }) => path)).not.toContain('issued_by');
    expect(values.some(({ value }) => value === extraction.id || value === rowId(extraction.id, 'certificate'))).toBe(false);
    expect(plan.acceptedFields['parcels[0].origin_text']).toEqual({ decision: 'edited', value: origin.replace(/\s+/gu, ' ').trim() });
  });

  it('plans a manual entry from typed values alone', () => {
    const manual = { ...extraction, result: null };
    const result = planCertificateAcceptance(
      manual,
      {
        form: { kind: 'edited', value: 'paper_only' },
        'parcels[0].parcel_no': { kind: 'edited', value: '12' },
        'parcels[0].area_m2': { kind: 'edited', value: '300' },
        'holders[0].full_name': { kind: 'accepted' },
      },
      none,
    );
    expect(tables(result)).toEqual(['certificates', 'parcels']);
    expect(rowsOf(result, 'parcels')[0]).toMatchObject({ parcel_no: '12', area_m2: 300, purposes: [] });
  });
});

describe('planUtilityBillAcceptance', () => {
  it('writes one utility account from the bill', () => {
    const bill = { ...extraction, result: billFile.bill };
    const result = planUtilityBillAcceptance(bill, acceptAll(billFile.bill, 'utility_bill_v1'), none);
    expect(planOf(result).steps).toEqual([
      {
        table: 'utility_accounts',
        row: {
          id: rowId(extraction.id, 'utility_account'),
          household_id: extraction.householdId,
          property_id: extraction.propertyId,
          unit_id: null,
          kind: 'electricity',
          provider: 'ĐIỆN LỰC DEMO TÂN THUẬN',
          customer_code: 'PE0901000001',
          holder_name: 'Nguyễn Thị Demo',
          note: null,
        },
      },
    ]);
  });

  it('reuses an account of the same kind and customer code on the property, and writes nothing', () => {
    const bill = { ...extraction, result: billFile.bill };
    const accounts = [{ id: '00000000-0000-4000-8000-00000000ac01', propertyId: extraction.propertyId, kind: 'electricity', customerCode: 'pe 0901000001' }];
    const result = planUtilityBillAcceptance(bill, acceptAll(billFile.bill, 'utility_bill_v1'), { accounts });
    expect(planOf(result).steps).toEqual([]);
    expect(planOf(result).acceptedFields['customer_code']).toEqual({ decision: 'accepted', value: 'PE0901000001' });
    const elsewhere = accounts.map((account) => ({ ...account, propertyId: '00000000-0000-4000-8000-0000000000b9' }));
    expect(tables(planUtilityBillAcceptance(bill, acceptAll(billFile.bill, 'utility_bill_v1'), { accounts: elsewhere }))).toEqual(['utility_accounts']);
  });
});

describe('planLeaseAcceptance', () => {
  const lease = {
    tenant_name: { value: 'Lê Văn Demo', confidence: 0.98, page: 1 },
    tenant_phone: { value: '0903 123 456', confidence: 0.97, page: 1 },
    rent_vnd: { value: 3_500_000, confidence: 0.99, page: 1 },
    billing_cycle_months: { value: 1, confidence: 0.95, page: 1 },
  };

  it('writes no row, keeping the accepted values for the lease form', () => {
    const plan = planOf(planLeaseAcceptance({ ...extraction, result: lease }, { tenant_name: { kind: 'accepted' }, rent_vnd: { kind: 'edited', value: '3tr8' } }));
    expect(plan.steps).toEqual([]);
    expect(plan.acceptedFields).toEqual({ tenant_name: { decision: 'accepted', value: 'Lê Văn Demo' }, rent_vnd: { decision: 'edited', value: 3_800_000 } });
  });

  it('refuses a cycle the lease form cannot bill', () => {
    expect(planLeaseAcceptance({ ...extraction, result: lease }, { billing_cycle_months: { kind: 'edited', value: '2' } })).toEqual({ ok: false, reason: 'out_of_range', paths: ['billing_cycle_months'] });
  });
});
