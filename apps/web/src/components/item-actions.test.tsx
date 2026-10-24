import { fireEvent, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import viMessages from '../../messages/vi.json';
import { renderInLocale } from '@/test/render';
import { ItemActions, type ItemActionLabels } from './item-actions';

const remove = vi.fn();
const restore = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const labels: ItemActionLabels = {
  edit: 'Sửa',
  editLabel: 'Sửa nhà ở',
  delete: 'Xóa',
  deleteLabel: 'Xóa nhà ở',
  deleting: 'Đang xóa',
  deleted: 'Đã xóa nhà ở.',
  deleteFailed: 'Chưa xóa được.',
  restoreFailed: 'Chưa khôi phục được. Tải lại trang rồi thử lại.',
};

const actions = <ItemActions editHref="/edit" remove={remove} restore={restore} labels={labels} />;

function Card() {
  const [removed, setRemoved] = useState(false);
  return removed ? null : <div onClickCapture={() => setTimeout(() => setRemoved(true), 0)}>{actions}</div>;
}

async function undoDelete() {
  renderInLocale(
    <UndoToastProvider>
      <Card />
    </UndoToastProvider>,
  );
  fireEvent.click(screen.getByTestId('delete-item'));
  fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }, { timeout: 5000 }));
  await waitFor(() => expect(screen.queryByTestId('delete-item')).toBeNull());
}

beforeEach(() => {
  remove.mockReset().mockResolvedValue({ ok: true, value: { id: 's1' } });
  restore.mockReset();
});

describe('ItemActions', () => {
  it('shows a failed Hoàn tác after the card has unmounted', async () => {
    restore.mockRejectedValue(new Error('offline'));
    await undoDelete();
    expect(await screen.findByText(labels.restoreFailed, undefined, { timeout: 5000 })).toBeTruthy();
  });

  it('shows a Hoàn tác the server refused in the toast, not beside the row', async () => {
    restore.mockResolvedValue({ ok: false });
    await undoDelete();
    const region = screen.getByRole('region', { name: 'Thông báo' });
    expect((await screen.findByText(labels.restoreFailed)).closest('[role="region"]')).toBe(region);
  });

  it('reads a delete that threw as a failed delete', async () => {
    remove.mockRejectedValue(new Error('offline'));
    renderInLocale(<UndoToastProvider>{actions}</UndoToastProvider>);
    fireEvent.click(screen.getByTestId('delete-item'));
    expect((await screen.findByRole('alert')).textContent).toBe(labels.deleteFailed);
  });

  it('renders the delete button disabled in the server HTML, before hydration can attach onClick', () => {
    const html = renderToString(
      <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
        <UndoToastProvider>{actions}</UndoToastProvider>
      </NextIntlClientProvider>,
    );
    const button = html.match(/<button[^>]*data-testid="delete-item"[^>]*>/)?.[0] ?? '';
    expect(button).toMatch(/\sdisabled(=|\s|>)/);
  });
});
