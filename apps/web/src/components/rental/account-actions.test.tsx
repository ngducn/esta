import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { renderInLocale } from '@/test/render';
import { AccountActions, type AccountActionLabels } from './account-actions';

const actions = vi.hoisted(() => ({ deleteAccount: vi.fn(), restoreAccount: vi.fn() }));

vi.mock('@/app/(app)/properties/[id]/rental/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const labels: AccountActionLabels = {
  edit: 'Sửa',
  editLabel: 'Sửa tài khoản điện',
  delete: 'Xóa',
  deleteLabel: 'Xóa tài khoản điện',
  deleting: 'Đang xóa',
  deleted: 'Đã xóa tài khoản điện.',
  deleteFailed: 'Chưa xóa được.',
  restoreFailed: 'Chưa khôi phục được. Tải lại trang rồi thử lại.',
};

function Row() {
  const [listed, setListed] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setListed(false)}>
        row gone
      </button>
      {listed ? <AccountActions propertyId="p1" accountId="a1" labels={labels} /> : null}
    </>
  );
}

async function undoDelete() {
  renderInLocale(
    <UndoToastProvider>
      <Row />
    </UndoToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: labels.deleteLabel }));
  fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }, { timeout: 5000 }));
}

beforeEach(() => {
  actions.deleteAccount.mockReset().mockResolvedValue({ ok: true, deleted: { propertyId: 'p1' } });
  actions.restoreAccount.mockReset();
});

describe('AccountActions', () => {
  it('shows a failed Hoàn tác in the toast after the account row has left the list', async () => {
    let failRestore = () => {};
    actions.restoreAccount.mockReturnValue(
      new Promise((_, reject) => {
        failRestore = () => reject(new Error('offline'));
      }),
    );
    await undoDelete();
    fireEvent.click(screen.getByRole('button', { name: 'row gone' }));
    expect(screen.queryByRole('button', { name: labels.deleteLabel })).toBeNull();
    failRestore();
    const region = screen.getByRole('region', { name: 'Thông báo' });
    expect((await screen.findByText(labels.restoreFailed)).closest('[role="region"]')).toBe(region);
  });

  it('shows a Hoàn tác the server refused in the toast', async () => {
    actions.restoreAccount.mockResolvedValue({ ok: false, reason: 'invalid' });
    await undoDelete();
    fireEvent.click(screen.getByRole('button', { name: 'row gone' }));
    const region = screen.getByRole('region', { name: 'Thông báo' });
    expect((await screen.findByText(labels.restoreFailed)).closest('[role="region"]')).toBe(region);
  });
});
