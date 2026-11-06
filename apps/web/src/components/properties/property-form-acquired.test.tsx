import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { EMPTY_PROPERTY } from './property-form-values';

const actions = vi.hoisted(() => ({ createProperty: vi.fn(), updateProperty: vi.fn(), loadCommunes: vi.fn() }));
vi.mock('@/app/(app)/properties/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { PropertyForm } = await import('./property-form');

const open = () =>
  renderInLocale(<PropertyForm propertyId={null} initial={{ ...EMPTY_PROPERTY, nickname: 'Nhà thử Demo', code: 'THU' }} provinces={[]} initialCommunes={[]} otherCodes={[]} cancelHref="/properties" />);

const typeAcquired = (text: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Ngày có tài sản' }), { target: { value: text } });

describe('property form: acquired on', () => {
  beforeEach(() => {
    actions.createProperty.mockReset().mockResolvedValue({ ok: true, id: 'p1' });
    actions.updateProperty.mockReset();
  });

  it('refuses to save while the date is not on the calendar, and saves once it is', async () => {
    open();
    typeAcquired('31/09/2026');
    fireEvent.submit(screen.getByTestId('property-form'));
    expect(actions.createProperty).not.toHaveBeenCalled();
    typeAcquired('30/09/2026');
    fireEvent.submit(screen.getByTestId('property-form'));
    await waitFor(() => expect(actions.createProperty).toHaveBeenCalledTimes(1));
    expect(actions.createProperty.mock.calls[0]?.[0]).toMatchObject({ acquired_on: '2026-09-30' });
  });

  it('saves an empty date as no date', async () => {
    open();
    fireEvent.submit(screen.getByTestId('property-form'));
    await waitFor(() => expect(actions.createProperty).toHaveBeenCalledTimes(1));
    expect(actions.createProperty.mock.calls[0]?.[0]).toMatchObject({ acquired_on: null });
  });
});
