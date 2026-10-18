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
  sensitive: false,
};

const open = () => renderInLocale(<DocumentEditSheet document={insurance} properties={[]} onClose={() => undefined} onSaved={() => undefined} />);

const typeExpiry = (text: string) => {
  const field = screen.getByLabelText('Ngày hết hạn (nếu có)');
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
};

const sent = () => updateDocument.mock.calls[0]?.[0] as { expiresOn?: unknown } | undefined;

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

  it('names the title and the tags the database judged to hold a full ID (D11)', async () => {
    updateDocument.mockResolvedValue({ ok: false, reason: 'national_id', fields: ['title', 'tags'] });
    open();
    fireEvent.click(screen.getByTestId('save-edit'));
    const message = 'Ô này còn số CCCD/CMND đầy đủ. Chỉ ghi 4 số cuối.';
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2));
    expect(screen.getByTestId('edit-title').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('edit-tags').getAttribute('aria-invalid')).toBe('true');
  });
});
