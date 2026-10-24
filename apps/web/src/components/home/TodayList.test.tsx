import { isoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { todayItems } from '@esta/core/today';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CollectionRow } from '@/server/collections/load';
import type { HomeSnapshot } from '@/server/home/load';
import { renderInLocale } from '@/test/render';
import { TodayList, type TodayPayment } from './TodayList';

const ON = isoDate('2026-10-07');

const phong5: CollectionRow = {
  invoiceId: '00000000-0000-4000-8000-0000000a0001',
  propertyId: '00000000-0000-4000-8000-0000000b0001',
  propertyName: 'Dãy trọ Dĩ An',
  unitLabel: 'Phòng 5',
  wholeUnit: false,
  propertyArchived: false,
  leaseId: '00000000-0000-4000-8000-0000000c0001',
  tenantName: 'Hoàng Văn Em Demo',
  number: 'DIAN-202609-002',
  dueDate: isoDate('2026-09-25'),
  totalVnd: vnd(2_800_000),
  allocatedVnd: vnd(0),
  outstandingVnd: vnd(2_800_000),
  paymentStatus: 'unpaid',
};

const SNAPSHOT: HomeSnapshot = {
  bills: [phong5],
  leases: [
    {
      leaseId: '00000000-0000-4000-8000-0000000c0002',
      propertyId: '00000000-0000-4000-8000-0000000b0002',
      propertyName: 'Căn hộ Thủ Đức',
      unitLabel: 'Toàn bộ',
      wholeUnit: true,
      status: 'active',
      endDate: isoDate('2026-11-01'),
      renewed: false,
    },
  ],
  documents: [{ documentId: '00000000-0000-4000-8000-0000000d0001', title: 'Bảo hiểm cháy nổ Nhà phố Q7', expiresOn: isoDate('2026-10-30') }],
  reviews: [{ documentId: '00000000-0000-4000-8000-0000000d0002', title: 'Sổ hồng Bảo Lộc' }],
};

const PAYMENT: TodayPayment = { intl: { locale: 'vi', messages: {} }, openInvoices: new Map(), account: null };

const itemNamed = (title: string) => {
  const heading = screen.getByText(title, { selector: '[data-testid="today-title"]' });
  const item = heading.closest('li');
  if (item === null) throw new Error(`no item for ${title}`);
  return within(item);
};

describe('TodayList', () => {
  it('gives a member who records one action per item: Ghi nhận, Gia hạn into the renew sheet, Xem tài liệu and Xem lại', () => {
    renderInLocale(<TodayList today={todayItems(SNAPSHOT, ON)} asOf={ON} payment={PAYMENT} />);
    expect(itemNamed('Phòng 5, Dãy trọ Dĩ An').getByRole('button', { name: 'Ghi nhận' }).getAttribute('aria-haspopup')).toBe('dialog');
    expect(itemNamed('Căn hộ Thủ Đức').getByRole('link', { name: 'Gia hạn' }).getAttribute('href')).toBe(`/properties/${SNAPSHOT.leases[0]?.propertyId}/rental/leases/${SNAPSHOT.leases[0]?.leaseId}?renew=1`);
    expect(itemNamed('Bảo hiểm cháy nổ Nhà phố Q7').getByRole('link', { name: 'Xem tài liệu' }).getAttribute('href')).toBe('/documents/00000000-0000-4000-8000-0000000d0001');
    expect(itemNamed('Sổ hồng Bảo Lộc').getByRole('link', { name: 'Xem lại' }).getAttribute('href')).toBe('/documents/00000000-0000-4000-8000-0000000d0002/review');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('names each action’s item, so four buttons and links read apart', () => {
    renderInLocale(<TodayList today={todayItems(SNAPSHOT, ON)} asOf={ON} payment={PAYMENT} />);
    const record = itemNamed('Phòng 5, Dãy trọ Dĩ An').getByRole('button', { name: 'Ghi nhận' });
    expect(document.getElementById(record.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Phòng 5, Dãy trọ Dĩ An');
    const renew = itemNamed('Căn hộ Thủ Đức').getByRole('link', { name: 'Gia hạn' });
    expect(document.getElementById(renew.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Căn hộ Thủ Đức');
  });

  it('gives a viewer links to read the bill, the lease and the document, and nothing that writes', () => {
    renderInLocale(<TodayList today={todayItems(SNAPSHOT, ON)} asOf={ON} payment={null} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(itemNamed('Phòng 5, Dãy trọ Dĩ An').getByRole('link', { name: 'Xem hóa đơn' }).getAttribute('href')).toBe(`/collections/invoices/${phong5.invoiceId}`);
    expect(itemNamed('Căn hộ Thủ Đức').getByRole('link', { name: 'Xem hợp đồng' }).getAttribute('href')).toBe(`/properties/${SNAPSHOT.leases[0]?.propertyId}/rental/leases/${SNAPSHOT.leases[0]?.leaseId}`);
    expect(itemNamed('Sổ hồng Bảo Lộc').getByRole('link', { name: 'Xem tài liệu' }).getAttribute('href')).toBe('/documents/00000000-0000-4000-8000-0000000d0002');
  });

  it('says there is nothing to do, and points to Thu tiền only when the list is cut', () => {
    const { unmount } = renderInLocale(<TodayList today={{ items: [], total: 0 }} asOf={ON} payment={PAYMENT} />);
    expect(screen.getByText('Hôm nay không có việc cần làm.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Xem tất cả ở Thu tiền' })).toBeNull();
    unmount();
    const today = todayItems(SNAPSHOT, ON);
    renderInLocale(<TodayList today={{ ...today, total: 9 }} asOf={ON} payment={PAYMENT} />);
    expect(screen.getByText('9 việc')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem tất cả ở Thu tiền' }).getAttribute('href')).toBe('/collections');
  });
});
