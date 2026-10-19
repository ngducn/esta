import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { renderInLocale } from '@/test/render';

const actions = vi.hoisted(() => ({ previewActivation: vi.fn(), activateLease: vi.fn() }));
vi.mock('@/server/actions/leases', () => actions);
const { default: ActivateLeaseDialog } = await import('./ActivateLeaseDialog');

const LEASE = '7a0f6e43-6f1a-4f43-9d6b-2f7f5c1d2e02';
const SEPTEMBER = { periodStart: '2026-09-15', periodEnd: '2026-10-14', dueDate: '2026-09-15', rentVnd: 3_000_000, issuesNow: true };

async function open() {
  renderInLocale(
    <UndoToastProvider>
      <ActivateLeaseDialog leaseId={LEASE} blocked={[]} onClose={() => undefined} onActivated={() => undefined} />
    </UndoToastProvider>,
  );
  await act(async () => undefined);
  const field = screen.getByRole('textbox', { name: 'Đã thu tiền đến hết ngày' });
  const confirm = screen.getByTestId('confirm-activate') as HTMLButtonElement;
  const type = async (text: string) => {
    fireEvent.change(field, { target: { value: text } });
    await act(async () => undefined);
  };
  return { confirm, type };
}

describe('ActivateLeaseDialog paid-through date', () => {
  beforeEach(() => {
    actions.previewActivation.mockReset().mockResolvedValue([SEPTEMBER]);
    actions.activateLease.mockReset().mockResolvedValue({ ok: true, issuedMonth: '2026-09-15' });
  });

  it('keeps Kích hoạt disabled and lists no bill while the field holds 31/09/2026', async () => {
    const { confirm, type } = await open();
    expect(confirm.disabled).toBe(false);
    await type('31/09/2026');
    expect(confirm.disabled).toBe(true);
    expect(screen.queryAllByTestId('preview-bill')).toEqual([]);
    fireEvent.click(confirm);
    expect(actions.activateLease).not.toHaveBeenCalled();
  });

  it('activates with an empty field as nothing collected', async () => {
    const { confirm } = await open();
    await act(async () => fireEvent.click(confirm));
    expect(actions.activateLease).toHaveBeenCalledWith(LEASE, '');
  });

  it('sends 30/09/2026 as typed, for the server to read', async () => {
    const { confirm, type } = await open();
    await type('30/09/2026');
    expect(confirm.disabled).toBe(false);
    await act(async () => fireEvent.click(confirm));
    expect(actions.activateLease).toHaveBeenCalledWith(LEASE, '30/09/2026');
  });

  it('shows the server refusal of an unreadable date under the field', async () => {
    actions.activateLease.mockResolvedValue({ ok: false, reasons: ['paid_through_invalid'] });
    const { confirm } = await open();
    await act(async () => fireEvent.click(confirm));
    expect(screen.getByTestId('paid-through-refused').textContent).toBe('Ngày đã thu tiền chưa đúng. Nhập ngày/tháng/năm có trên lịch, hoặc để trống nếu chưa thu.');
    expect(screen.queryByTestId('activate-refusals')).toBeNull();
  });
});
