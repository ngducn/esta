import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { CertificateForm } from './certificate-form';

const actions = vi.hoisted(() => ({ saveLegalItem: vi.fn() }));
vi.mock('@/app/(app)/properties/[id]/legal/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const BANK = '7a0f6e43-6f1a-4f43-9d6b-2f7f5c1d2e09';

const INITIAL = { form: 'gcn_2009_2024', serial_no: 'AB 123456', book_entry_no: null, issued_on: '2015-03-10', issued_by: null, holder_party_ids: [], annotations: [], status: 'valid', mortgage: null } as never;

function renderForm(initial: unknown = INITIAL) {
  renderInLocale(<CertificateForm propertyId="p1" itemId="c1" initial={initial as never} parties={[{ id: BANK, fullName: 'Ngân hàng Demo', kind: 'organization', isBank: true }]} />);
}

describe('certificate form: dates', () => {
  beforeEach(() => actions.saveLegalItem.mockReset().mockResolvedValue({ ok: true }));

  it('refuses to save while the issue date is not on the calendar, and saves once it is', () => {
    renderForm();
    fireEvent.change(screen.getByRole('textbox', { name: 'Ngày cấp' }), { target: { value: '31/09/2015' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(actions.saveLegalItem).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Ngày cấp' }), { target: { value: '30/09/2015' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(actions.saveLegalItem).toHaveBeenCalledTimes(1);
  });

  it('refuses to save while an annotation date is not on the calendar', () => {
    renderForm({ ...(INITIAL as object), annotations: [{ date: '2020-01-01', text: 'Ghi chú Demo', kind: null }] });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ngày' }), { target: { value: '30/02/2020' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(actions.saveLegalItem).not.toHaveBeenCalled();
  });

  it('saves after the release field held 31/09/2026 and the status became mortgaged', () => {
    renderInLocale(
      <CertificateForm
        propertyId="p1"
        itemId="c1"
        initial={{ form: 'gcn_2009_2024', serial_no: 'AB 123456', book_entry_no: null, issued_on: '2015-03-10', issued_by: null, holder_party_ids: [], annotations: [], status: 'valid', mortgage: { bank_party_id: BANK, amount_vnd: 1_000_000_000, registered_on: '2020-01-01', released_on: '2024-01-01' } } as never}
        parties={[{ id: BANK, fullName: 'Ngân hàng Demo', kind: 'organization', isBank: true }]}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Ngày giải chấp' }), { target: { value: '31/09/2026' } });
    fireEvent.change(screen.getByTestId('certificate-status-select'), { target: { value: 'mortgaged' } });
    expect(screen.queryByRole('textbox', { name: 'Ngày giải chấp' }), 'the release field is gone').toBeNull();
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    const alert = screen.queryByTestId('form-error')?.textContent ?? '';
    const flagged = [...document.querySelectorAll('[aria-invalid="true"]')].length;
    expect({ called: actions.saveLegalItem.mock.calls.length, alert, flagged }).toEqual({ called: 1, alert: '', flagged: 0 });
  });
});
