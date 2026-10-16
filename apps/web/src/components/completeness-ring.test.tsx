import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { CompletenessRing } from './completeness-ring';

const arcClass = (container: HTMLElement) => container.querySelector('circle[stroke-dasharray]')?.getAttribute('class');

describe('CompletenessRing', () => {
  it('draws a complete ring in the paid color, which the accent would read as overdue', () => {
    const { container } = renderInLocale(<CompletenessRing percent={100} missing={0} />);
    expect(arcClass(container)).toBe('stroke-paid');
    expect(container.textContent).toContain('Đủ thông tin');
  });

  it('draws progress in the accent', () => {
    const { container } = renderInLocale(<CompletenessRing percent={70} missing={3} />);
    expect(arcClass(container)).toBe('stroke-accent');
  });

  it('draws no arc at zero', () => {
    const { container } = renderInLocale(<CompletenessRing percent={0} missing={12} />);
    expect(arcClass(container)).toBeUndefined();
  });
});
