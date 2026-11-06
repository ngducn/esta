import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { OwnershipForm } from './ownership-form';

const actions = vi.hoisted(() => ({ saveOwnershipShares: vi.fn() }));
vi.mock('@/app/(app)/properties/[id]/legal/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const PARTY = '7a0f6e43-6f1a-4f43-9d6b-2f7f5c1d2e02';

function open() {
  renderInLocale(
    <OwnershipForm
      propertyId="p1"
      shares={[{ party_id: PARTY, share_bp: 10_000, named_on_certificate: true, since: null }]}
      parties={[{ id: PARTY, fullName: 'Demo Owner', kind: 'individual', isBank: false }]}
      holderIds={[]}
      cancel={null}
      inSheet={false}
    />,
  );
  return { since: screen.getByRole('textbox', { name: 'Sở hữu từ ngày (không bắt buộc)' }), save: screen.getByTestId('save-ownership') };
}

describe('OwnershipForm since date', () => {
  beforeEach(() => actions.saveOwnershipShares.mockReset().mockResolvedValue({ ok: true }));

  it('refuses to save while the field holds 31/09/2026', () => {
    const { since, save } = open();
    fireEvent.change(since, { target: { value: '31/09/2026' } });
    fireEvent.click(save);
    expect(actions.saveOwnershipShares).not.toHaveBeenCalled();
    expect(screen.getByTestId('ownership-error')).toBeTruthy();
  });

  it('saves an emptied field as no date', () => {
    const { since, save } = open();
    fireEvent.change(since, { target: { value: '31/09/2026' } });
    fireEvent.change(since, { target: { value: '' } });
    fireEvent.click(save);
    expect(actions.saveOwnershipShares).toHaveBeenCalledWith('p1', [expect.objectContaining({ since: null })], expect.anything());
  });
});
