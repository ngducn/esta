import { collectionState } from '@esta/core/collections';
import { isoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { describe, expect, it } from 'vitest';
import type { CollectionRow } from '@/server/collections/load';
import { collectionRowActions } from './rowActions';

const row: CollectionRow = {
  invoiceId: '00000000-0000-4000-8000-0000000a0001',
  propertyId: '00000000-0000-4000-8000-0000000b0001',
  propertyName: 'Nhà Demo',
  unitLabel: 'Toàn bộ',
  wholeUnit: true,
  propertyArchived: false,
  leaseId: '00000000-0000-4000-8000-0000000c0001',
  tenantName: 'Hoàng Văn Em Demo',
  number: 'DEMO-202609-001',
  dueDate: isoDate('2026-09-05'),
  totalVnd: vnd(9_000_000),
  allocatedVnd: vnd(0),
  outstandingVnd: vnd(9_000_000),
  paymentStatus: 'unpaid',
};

const item = (value: CollectionRow) => ({ row: value, state: collectionState(value, isoDate('2026-10-07')), amountVnd: value.outstandingVnd, carriedFrom: null });
const ids = (value: CollectionRow) => collectionRowActions(item(value), true).map((action) => action.id);

describe('collectionRowActions', () => {
  it('offers the lease link on a live property', () => {
    expect(ids(row)).toEqual(['record-payment', 'qr', 'remind', 'open-lease']);
  });

  it('keeps collecting on a bill of an archived property but offers no link to its gone pages', () => {
    expect(ids({ ...row, propertyArchived: true })).toEqual(['record-payment', 'qr', 'remind']);
  });
});
