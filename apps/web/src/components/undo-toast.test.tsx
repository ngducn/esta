import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { UNDO_MS, UndoToastProvider, useUndoToast } from './undo-toast';

function Trigger({ onUndo }: { onUndo: () => void }) {
  const show = useUndoToast();
  return (
    <button type="button" onClick={() => show('Đã ghi nhận 3.500.000 ₫ từ Phòng 3.', onUndo)}>
      trigger
    </button>
  );
}

function setup() {
  const onUndo = vi.fn();
  renderInLocale(
    <UndoToastProvider>
      <Trigger onUndo={onUndo} />
    </UndoToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
  return { onUndo };
}

describe('UndoToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('names what happened and calls the undo handler once on Hoàn tác', () => {
    const { onUndo } = setup();
    expect(screen.getByText('Đã ghi nhận 3.500.000 ₫ từ Phòng 3.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('leaves after 6 seconds without undoing', () => {
    const { onUndo } = setup();
    act(() => vi.advanceTimersByTime(UNDO_MS + 1000));
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).toBeNull();
    expect(onUndo).not.toHaveBeenCalled();
  });
});
