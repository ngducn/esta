import type { Unit } from '@esta/core/schemas/units';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { renderInLocale } from '@/test/render';
import viMessages from '../../../messages/vi.json';
import { UnitList } from './unit-list';

const actions = vi.hoisted(() => ({ moveUnitAction: vi.fn(), sortUnitsByRoomNumber: vi.fn(), deleteUnit: vi.fn(), restoreUnit: vi.fn(), saveUnit: vi.fn() }));

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
      <UnitList propertyId="p1" units={units} leases={{}} canEdit roomingHouse />
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

const list = (units: readonly Unit[], canEdit = true) =>
  renderInLocale(
    <UndoToastProvider>
      <UnitList propertyId="p1" units={units} leases={{}} canEdit={canEdit} roomingHouse />
    </UndoToastProvider>,
  );
const moveButtons = () => screen.queryAllByRole('button', { name: /^Đưa Phòng/u });

describe('UnitList reorder mode', () => {
  it('hides Lên and Xuống until Sắp xếp phòng, and Xong hides them again', () => {
    list(rooms);
    expect(moveButtons()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp phòng' }));
    expect(moveButtons().map((button) => button.getAttribute('aria-label'))).toEqual(['Đưa Phòng 101 lên', 'Đưa Phòng 101 xuống', 'Đưa Phòng 102 lên', 'Đưa Phòng 102 xuống']);
    expect(screen.getByRole('button', { name: 'Đưa Phòng 101 lên' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Thêm phòng' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));
    expect(moveButtons()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Thêm phòng' })).toBeTruthy();
  });

  it('offers no reorder to a viewer or for a single unit', () => {
    const viewer = list(rooms, false);
    expect(screen.queryByRole('button', { name: 'Sắp xếp phòng' })).toBeNull();
    viewer.unmount();
    list(rooms.slice(0, 1));
    expect(screen.queryByRole('button', { name: 'Sắp xếp phòng' })).toBeNull();
  });

  it('sends Xếp theo số phòng only when the rooms are out of number order', () => {
    actions.sortUnitsByRoomNumber.mockReset().mockResolvedValue({ ok: true, id: 'p1' });
    const sorted = list(rooms);
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp phòng' }));
    expect(screen.getByRole('button', { name: 'Xếp theo số phòng' })).toHaveProperty('disabled', true);
    sorted.unmount();
    list([room('u2', 'Phòng 102', 1), room('u1', 'Phòng 101', 2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Sắp xếp phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xếp theo số phòng' }));
    expect(actions.sortUnitsByRoomNumber).toHaveBeenCalledWith('p1');
  });
});
