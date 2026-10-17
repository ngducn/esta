import type { Unit } from '@esta/core/schemas/units';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider } from '@/components/undo-toast';
import { renderInLocale } from '@/test/render';
import viMessages from '../../../messages/vi.json';
import { UnitList } from './unit-list';

const actions = vi.hoisted(() => ({ moveUnitAction: vi.fn(), deleteUnit: vi.fn(), restoreUnit: vi.fn(), saveUnit: vi.fn() }));

vi.mock('@/app/(app)/properties/[id]/rental/actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const room = (id: string, label: string, sort_order: number): Unit => ({ id, label, kind: 'room', area_m2: null, list_rent_vnd: null, available_from: null, sort_order });
const rooms = [room('u1', 'Phòng 101', 1), room('u2', 'Phòng 102', 2)];
const restoreFailed = viMessages.propertyRental.restoreFailed;

function Rooms() {
  const [units, setUnits] = useState(rooms);
  return (
    <>
      <button type="button" onClick={() => setUnits(rooms.slice(1))}>
        row gone
      </button>
      <UnitList propertyId="p1" units={units} canEdit roomingHouse />
    </>
  );
}

async function undoDelete() {
  renderInLocale(
    <UndoToastProvider>
      <Rooms />
    </UndoToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sửa Phòng 101' }));
  fireEvent.click(await screen.findByTestId('delete-unit', undefined, { timeout: 5000 }));
  fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }, { timeout: 5000 }));
}

beforeEach(() => {
  actions.deleteUnit.mockReset().mockResolvedValue({ ok: true, deleted: { propertyId: 'p1' } });
  actions.restoreUnit.mockReset();
});

describe('UnitList', () => {
  it('shows a failed Hoàn tác in the toast, not above the list, after the room row has left it', async () => {
    let failRestore = () => {};
    actions.restoreUnit.mockReturnValue(
      new Promise((_, reject) => {
        failRestore = () => reject(new Error('offline'));
      }),
    );
    await undoDelete();
    fireEvent.click(screen.getByRole('button', { name: 'row gone' }));
    expect(screen.queryByText('Phòng 101')).toBeNull();
    failRestore();
    const region = screen.getByRole('region', { name: 'Thông báo' });
    expect((await screen.findByText(restoreFailed)).closest('[role="region"]')).toBe(region);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a Hoàn tác the server refused in the toast', async () => {
    actions.restoreUnit.mockResolvedValue({ ok: false, reason: 'invalid' });
    await undoDelete();
    fireEvent.click(screen.getByRole('button', { name: 'row gone' }));
    const region = screen.getByRole('region', { name: 'Thông báo' });
    expect((await screen.findByText(restoreFailed)).closest('[role="region"]')).toBe(region);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
