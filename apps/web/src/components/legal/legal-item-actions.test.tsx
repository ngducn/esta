import { fireEvent, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider } from '@/components/undo-toast';
import viMessages from '../../../messages/vi.json';
import { renderInLocale } from '@/test/render';
import { LegalItemActions, type LegalItemActionLabels } from './legal-item-actions';

const actions = vi.hoisted(() => ({ deleteLegalItem: vi.fn(), restoreLegalItem: vi.fn() }));

vi.mock('@/app/(app)/properties/[id]/legal/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const labels: LegalItemActionLabels = {
  edit: 'Sửa',
  editLabel: 'Sửa nhà ở',
  delete: 'Xóa',
  deleteLabel: 'Xóa nhà ở',
  deleting: 'Đang xóa',
  deleted: 'Đã xóa nhà ở.',
  deleteFailed: 'Chưa xóa được.',
  restoreFailed: 'Chưa khôi phục được. Tải lại trang rồi thử lại.',
};

function Card() {
  const [removed, setRemoved] = useState(false);
  return removed ? null : (
    <div onClickCapture={() => setTimeout(() => setRemoved(true), 0)}>
      <LegalItemActions propertyId="p1" kind="structures" itemId="s1" labels={labels} />
    </div>
  );
}

beforeEach(() => {
  actions.deleteLegalItem.mockReset().mockResolvedValue({ ok: true, deleted: { kind: 'structures' } });
  actions.restoreLegalItem.mockReset();
});

describe('LegalItemActions', () => {
  it('shows a failed Hoàn tác after the card has unmounted', async () => {
    actions.restoreLegalItem.mockRejectedValue(new Error('offline'));
    renderInLocale(
      <UndoToastProvider>
        <Card />
      </UndoToastProvider>,
    );
    fireEvent.click(screen.getByTestId('delete-legal-item'));
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(screen.queryByTestId('delete-legal-item')).toBeNull());
    expect(await screen.findByText(labels.restoreFailed)).toBeTruthy();
  });

  it('renders the delete button disabled in the server HTML, before hydration can attach onClick', () => {
    const html = renderToString(
      <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
        <UndoToastProvider>
          <LegalItemActions propertyId="p1" kind="structures" itemId="s1" labels={labels} />
        </UndoToastProvider>
      </NextIntlClientProvider>,
    );
    const button = html.match(/<button[^>]*data-testid="delete-legal-item"[^>]*>/)?.[0] ?? '';
    expect(button).toMatch(/\sdisabled(=|\s|>)/);
  });
});
