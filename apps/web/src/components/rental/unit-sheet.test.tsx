import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import UnitSheet from './unit-sheet';

const saved = vi.hoisted(() => ({ saveUnit: vi.fn() }));
vi.mock('@/app/(app)/properties/[id]/rental/actions', () => saved);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

function open() {
  renderInLocale(<UnitSheet open onOpenChange={() => undefined} finalFocus={{ current: null }} propertyId="p1" unit={null} otherUnits={1} onDelete={null} />);
  fireEvent.change(document.getElementById('unit-label') as HTMLInputElement, { target: { value: 'Phòng 7' } });
  const field = screen.getByRole('textbox', { name: 'Có thể cho thuê từ' });
  return { field, save: screen.getByTestId('save-unit') };
}

describe('UnitSheet available-from date', () => {
  beforeEach(() => saved.saveUnit.mockReset().mockResolvedValue({ ok: true }));

  it('refuses to save while the field holds 31/09/2026', () => {
    const { field, save } = open();
    fireEvent.change(field, { target: { value: '31/09/2026' } });
    fireEvent.click(save);
    expect(saved.saveUnit).not.toHaveBeenCalled();
  });

  it('saves an emptied field as no date', () => {
    const { field, save } = open();
    fireEvent.change(field, { target: { value: '30/09/2026' } });
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(save);
    expect(saved.saveUnit).toHaveBeenCalledWith('p1', null, expect.objectContaining({ available_from: null }));
  });

  it('saves a real day as typed', () => {
    const { field, save } = open();
    fireEvent.change(field, { target: { value: '30/09/2026' } });
    fireEvent.click(save);
    expect(saved.saveUnit).toHaveBeenCalledWith('p1', null, expect.objectContaining({ available_from: '2026-09-30' }));
  });
});
