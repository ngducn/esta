import { describe, expect, it } from 'vitest';
import { leaseFieldsFromExtraction } from './fromExtraction';

const accepted = (value: unknown, decision: 'accepted' | 'edited' = 'accepted') => ({ decision, value });

const UNITS = [
  { id: '00000000-0000-4000-8000-000000000007', label: 'Phòng 7' },
  { id: '00000000-0000-4000-8000-000000000008', label: 'Phòng 8' },
];

const contract = {
  tenant_name: accepted('Lê Văn Demo'),
  tenant_phone: accepted('0903 123 456'),
  unit_label: accepted('phòng  8'),
  start_date: accepted('2026-10-15'),
  end_date: accepted('2027-10-14'),
  rent_vnd: accepted(3_500_000, 'edited'),
  billing_cycle_months: accepted(1),
  deposit_vnd: accepted(7_000_000),
};

describe('leaseFieldsFromExtraction', () => {
  it('maps every accepted field to the lease form', () => {
    expect(leaseFieldsFromExtraction(contract, UNITS)).toEqual({
      terms: {
        unit_id: '00000000-0000-4000-8000-000000000008',
        start_date: '2026-10-15',
        end_date: '2027-10-14',
        rent_vnd: 3_500_000,
        billing_cycle_months: 1,
        deposit_vnd: 7_000_000,
      },
      tenant: { fullName: 'Lê Văn Demo', phone: '0903 123 456' },
    });
  });

  it('ends a lease that names only its term the day before the term runs out', () => {
    const { end_date: _end, ...rest } = contract;
    expect(leaseFieldsFromExtraction({ ...rest, term_months: accepted(6) }, UNITS).terms.end_date).toBe('2027-04-14');
    expect(leaseFieldsFromExtraction({ ...rest, term_months: accepted(12) }, UNITS).terms.end_date).toBe('2027-10-14');
  });

  it('keeps a printed end date over the term', () => {
    expect(leaseFieldsFromExtraction({ ...contract, term_months: accepted(6) }, UNITS).terms.end_date).toBe('2027-10-14');
  });

  it('leaves the unit to Mẹ when no room carries the label read', () => {
    expect(leaseFieldsFromExtraction({ ...contract, unit_label: accepted('Phòng 12') }, UNITS).terms).not.toHaveProperty('unit_id');
  });

  it('leaves out a value that does not read as its kind, never guessing', () => {
    const terms = leaseFieldsFromExtraction(
      {
        ...contract,
        start_date: accepted('15/10/2026'),
        rent_vnd: accepted(0),
        billing_cycle_months: accepted(2),
        deposit_vnd: accepted(-1),
      },
      UNITS,
    ).terms;
    expect(terms).toEqual({ unit_id: '00000000-0000-4000-8000-000000000008', end_date: '2027-10-14' });
  });

  it('drops an end date before the start', () => {
    expect(leaseFieldsFromExtraction({ ...contract, end_date: accepted('2026-01-01') }, UNITS).terms).not.toHaveProperty('end_date');
  });

  it('names no tenant without a name, and a tenant without a phone when only the name was read', () => {
    const { tenant_name: _name, ...noName } = contract;
    expect(leaseFieldsFromExtraction(noName, UNITS).tenant).toBeNull();
    const { tenant_phone: _phone, ...noPhone } = contract;
    expect(leaseFieldsFromExtraction(noPhone, UNITS).tenant).toEqual({ fullName: 'Lê Văn Demo', phone: null });
  });

  it('reads nothing from a value that is not an accepted-fields record', () => {
    expect(leaseFieldsFromExtraction(null, UNITS)).toEqual({ terms: {}, tenant: null });
    expect(leaseFieldsFromExtraction({ rent_vnd: 3_500_000 }, UNITS)).toEqual({ terms: {}, tenant: null });
  });
});
