import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { DateInput } from './date-input';
import { SETTLE_MS } from './use-settled';

function setup() {
  const onValueChange = vi.fn();
  renderInLocale(<DateInput label="Ngày bắt đầu" name="start" onValueChange={onValueChange} />);
  const input = screen.getByLabelText('Ngày bắt đầu');
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const message = () => document.getElementById(input.getAttribute('aria-describedby')?.split(' ')[1] ?? '');
  const hidden = () => document.querySelector<HTMLInputElement>('input[type="hidden"][name="start"]');
  return { input, type, message, hidden, onValueChange };
}

describe('DateInput', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits 2026-10-07 for 07/10/2026 and submits it in the hidden field', () => {
    const { input, type, hidden, onValueChange } = setup();
    type('07/10/2026');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-10-07');
    expect(hidden()?.value).toBe('2026-10-07');
    expect(screen.getByTestId('date-preview').getAttribute('dateTime')).toBe('2026-10-07');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('rejects 31/02/2026 as a day not on the calendar and emits nothing', () => {
    const { input, type, message, hidden, onValueChange } = setup();
    type('31/02/2026');
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(hidden()?.value).toBe('');
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(message()?.textContent).toContain('Ngày này không có trên lịch.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByTestId('date-preview')).toBeNull();
  });
});
