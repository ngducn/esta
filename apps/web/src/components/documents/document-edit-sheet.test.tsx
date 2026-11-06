import type { IsoDate } from '@esta/core/date';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import type { DocumentDetail } from '@/server/documents/detail';

const updateDocument = vi.hoisted(() => vi.fn());
vi.mock('@/server/documents/actions', () => ({ updateDocument }));

const { default: DocumentEditSheet } = await import('./document-edit-sheet');

const insurance: DocumentDetail = {
  id: '00000000-0000-4000-8000-00000000d0a3',
  title: 'Bảo hiểm nhà Q7',
  category: 'insurance',
  categoryLabel: 'Bảo hiểm',
  mime: 'application/pdf',
  pageCount: 1,
  propertyId: null,
  propertyName: null,
  expiresOn: '2026-10-30' as IsoDate,
  expiryText: 'Hết hạn sau 23 ngày',
  expiringSoon: true,
  tags: [],
  hasReadText: false,
};

const open = (document: DocumentDetail = insurance) => renderInLocale(<DocumentEditSheet open onOpenChange={() => undefined} finalFocus={{ current: null }} document={document} properties={[]} onSaved={() => undefined} />);

const typeExpiry = (text: string) => {
  const field = screen.getByLabelText('Ngày hết hạn (nếu có)');
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
};

const sent = () => updateDocument.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  updateDocument.mockReset();
  updateDocument.mockImplementation(async (input: unknown) => ({ ok: true, previous: input }));
});

describe('Sửa thông tin', () => {
  it.each(['31/02/2027', '30-10-26', '30/10', 'abc'])('refuses the unreadable date %j under the field and sends nothing', async (typed) => {
    open();
    typeExpiry(typed);
    fireEvent.click(screen.getByTestId('save-edit'));
    expect((await screen.findByTestId('edit-invalid')).textContent).toMatch(/^Chưa lưu/);
    expect(screen.getByText(/Ngày chưa đúng\./)).toBeTruthy();
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it('clears the expiry date when the field is emptied on purpose', async () => {
    open();
    typeExpiry('');
    fireEvent.click(screen.getByTestId('save-edit'));
    await waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1));
    expect(sent()?.expiresOn).toBeNull();
  });

  it('sends a readable date as an ISO date', async () => {
    open();
    typeExpiry('12/10/2026');
    fireEvent.click(screen.getByTestId('save-edit'));
    await waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1));
    expect(sent()?.expiresOn).toBe('2026-10-12');
  });

  it('keeps the stored date when the field is left alone', async () => {
    open();
    fireEvent.click(screen.getByTestId('save-edit'));
    await waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1));
    expect(sent()?.expiresOn).toBe('2026-10-30');
  });

  it('sends a title and tags holding a full ID as typed, and offers no sensitivity switch (D11, DOC-5)', async () => {
    open();
    fireEvent.change(screen.getByTestId('edit-title'), { target: { value: 'CCCD mẹ 079123456789' } });
    fireEvent.change(screen.getByTestId('edit-tags'), { target: { value: 'demo, 079123456789' } });
    expect(screen.queryByText(/nhạy cảm/u)).toBeNull();
    fireEvent.click(screen.getByTestId('save-edit'));
    await waitFor(() => expect(updateDocument).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ title: 'CCCD mẹ 079123456789', tags: ['demo', '079123456789'] });
    expect(sent()).not.toHaveProperty('sensitive');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says that search inside the document stops, only when a document with read text becomes sensitive (#151)', () => {
    open({ ...insurance, hasReadText: true });
    expect(screen.queryByTestId('edit-drops-text')).toBeNull();
    fireEvent.change(screen.getByTestId('edit-category'), { target: { value: 'id_card' } });
    expect(screen.getByTestId('edit-drops-text').textContent).toMatch(/không giữ chữ đã đọc/u);
    fireEvent.change(screen.getByTestId('edit-category'), { target: { value: 'invoice_receipt' } });
    expect(screen.queryByTestId('edit-drops-text')).toBeNull();
  });

  it('says nothing about read text when the document has none (#151)', () => {
    open();
    fireEvent.change(screen.getByTestId('edit-category'), { target: { value: 'id_card' } });
    expect(screen.queryByTestId('edit-drops-text')).toBeNull();
  });
});
