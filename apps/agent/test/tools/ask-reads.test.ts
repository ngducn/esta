import { isoDate } from '@esta/core/date';
import * as ops from '@esta/ops';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import { askReads } from '../../src/tools/ask-reads';

vi.mock('@esta/ops', async (original) => ({
  ...(await original<typeof import('@esta/ops')>()),
  readReportSnapshot: vi.fn(async () => ({})),
  readCollectionRows: vi.fn(async () => []),
  listLeases: vi.fn(async () => []),
  readLegalRows: vi.fn(async () => []),
  readOwnership: vi.fn(async () => []),
  readInvoicePayments: vi.fn(async () => []),
  readPropertyDetail: vi.fn(async () => null),
}));

const HOUSEHOLD_A = '00000000-0000-4000-8000-00000000a0a0';

afterEach(() => vi.clearAllMocks());

describe('the ask job reads (AGENT.md §4)', () => {
  it('hands the job household to every ops read, so no tool reads another household', async () => {
    const reads = askReads(fakeDb({ parties: [] }), HOUSEHOLD_A, { locale: 'vi', asOf: isoDate('2026-10-07') });
    await Promise.all([reads.report(2026), reads.collections(isoDate('2026-10-01')), reads.leases(), reads.property('p1'), reads.legal('p1'), reads.payments(['i1'])]);
    expect(vi.mocked(ops.readReportSnapshot).mock.calls.map(([, household]) => household)).toEqual([HOUSEHOLD_A]);
    expect(vi.mocked(ops.readCollectionRows).mock.calls.map(([, household]) => household)).toEqual([HOUSEHOLD_A]);
    expect(vi.mocked(ops.listLeases).mock.calls.map(([options]) => options.householdId)).toEqual([HOUSEHOLD_A]);
    expect(vi.mocked(ops.readPropertyDetail).mock.calls.map(([, household]) => household)).toEqual([HOUSEHOLD_A]);
    expect(vi.mocked(ops.readLegalRows).mock.calls.map(([, household]) => household)).toEqual([HOUSEHOLD_A]);
    expect(vi.mocked(ops.readOwnership).mock.calls.map(([, household]) => household)).toEqual([HOUSEHOLD_A]);
    expect(vi.mocked(ops.readInvoicePayments).mock.calls.map(([, household]) => household)).toEqual([HOUSEHOLD_A]);
  });

  it("marks a lease whose property was archived, so no tool lists it or counts its deposit", async () => {
    const lease = (id: string, property_id: string) => ({ id, property_id }) as unknown as Awaited<ReturnType<typeof ops.listLeases>>[number];
    vi.mocked(ops.listLeases).mockResolvedValueOnce([lease('l1', 'live'), lease('l2', 'gone')]);
    const db = fakeDb({ properties: [{ id: 'live', household_id: HOUSEHOLD_A, deleted_at: null }, { id: 'gone', household_id: HOUSEHOLD_A, deleted_at: '2026-09-01T00:00:00+07:00' }] });
    const leases = await askReads(db, HOUSEHOLD_A, { locale: 'vi', asOf: isoDate('2026-10-07') }).leases();
    expect(leases.map(({ id, property_archived }) => [id, property_archived])).toEqual([['l1', false], ['l2', true]]);
  });

  it('reads each argument once per run, however often the model asks', async () => {
    const reads = askReads(fakeDb({}), HOUSEHOLD_A, { locale: 'vi', asOf: isoDate('2026-10-07') });
    await Promise.all([reads.report(2026), reads.report(2026), reads.report(2025)]);
    expect(vi.mocked(ops.readReportSnapshot)).toHaveBeenCalledTimes(2);
  });
});
