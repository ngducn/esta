import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInLocale } from '@/test/render';
import { SETTLE_MS } from '../use-settled';
import { MoneyInput } from './money-input';

const NBSP = ' ';

function setup() {
  const onValueChange = vi.fn();
  renderInLocale(<MoneyInput label="Số tiền đã nhận" onValueChange={onValueChange} />);
  const input = screen.getByLabelText('Số tiền đã nhận');
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const message = () => document.getElementById(input.getAttribute('aria-describedby')?.split(' ')[1] ?? '');
  return { input, type, message, onValueChange };
}

describe('MoneyInput', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['3tr5', 3_500_000, `3.500.000${NBSP}₫`],
    ['3,5tr', 3_500_000, `3.500.000${NBSP}₫`],
    ['3.500.000', 3_500_000, `3.500.000${NBSP}₫`],
    ['1ty2', 1_200_000_000, `1.200.000.000${NBSP}₫`],
    ['850k', 850_000, `850.000${NBSP}₫`],
    ['15 triệu', 15_000_000, `15.000.000${NBSP}₫`],
  ])('reads %s as %i and shows the full amount under the field', (text, amount, shown) => {
    const { input, type, message, onValueChange } = setup();
    type(text);
    expect(onValueChange).toHaveBeenLastCalledWith(amount);
    expect(message()?.textContent).toContain(shown);
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('rejects abc in plain Vietnamese once typing pauses, and emits null', () => {
    const { input, type, message, onValueChange } = setup();
    type('abc');
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(message()?.textContent).toBe('');
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(message()?.textContent).toContain('Số tiền chưa đúng.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not flag a half-typed amount while typing continues', () => {
    const { input, type, message } = setup();
    type('3t');
    act(() => vi.advanceTimersByTime(SETTLE_MS - 100));
    type('3tr5');
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(message()?.textContent).toContain(`3.500.000${NBSP}₫`);
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it.each([
    ['1.500,000', 'Dùng dấu chấm để tách hàng nghìn'],
    ['3,5tr5', 'Viết 3tr5 hoặc 3,5tr'],
  ])('names the reason for %s on blur', (text, reason) => {
    const { input, type, message } = setup();
    type(text);
    fireEvent.blur(input);
    expect(message()?.textContent).toContain('Số tiền chưa đúng.');
    expect(message()?.textContent).toContain(reason);
  });

  it('shows the preview in English formatting under the English locale', () => {
    renderInLocale(<MoneyInput label="Amount received" defaultText="3tr5" />, 'en');
    expect(screen.getByTestId('money-preview').textContent).toBe(`3,500,000${NBSP}₫`);
  });
});
