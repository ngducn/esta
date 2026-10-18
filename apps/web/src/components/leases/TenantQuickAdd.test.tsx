import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';

const actions = vi.hoisted(() => ({ createTenant: vi.fn() }));
vi.mock('@/server/actions/leases', () => actions);
const { TenantQuickAdd } = await import('./TenantQuickAdd');

describe('TenantQuickAdd', () => {
  it('names the name field when the server refuses a full ID in it, and adds no one (D11)', async () => {
    actions.createTenant.mockResolvedValue({ ok: false, reason: 'national_id' });
    const onAdded = vi.fn();
    renderInLocale(<TenantQuickAdd onAdded={onAdded} />);
    fireEvent.click(screen.getByTestId('add-tenant'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Họ tên' }), { target: { value: 'Lê Văn Demo CCCD 079123456789' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Số điện thoại/ }), { target: { value: '0903 123 456' } });
    await act(async () => fireEvent.click(screen.getByTestId('save-tenant')));
    const name = screen.getByRole('textbox', { name: 'Họ tên' });
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Ô này còn số CCCD/CMND đầy đủ. Chỉ ghi 4 số cuối.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Số điện thoại/ }).getAttribute('aria-invalid')).toBe('false');
    expect(onAdded).not.toHaveBeenCalled();
  });
});
