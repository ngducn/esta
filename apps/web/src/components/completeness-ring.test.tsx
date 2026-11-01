import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { CompletenessRing } from './completeness-ring';

const arcClass = (container: HTMLElement) => container.querySelector('circle[stroke-dasharray]')?.getAttribute('class');

describe('CompletenessRing', () => {
  it('draws a complete ring in the paid color, which the accent would read as overdue', () => {
    const { container } = renderInLocale(<CompletenessRing percent={100} missing={0} />);
    expect(arcClass(container)).toContain('stroke-success-text');
    expect(container.textContent).toContain('Đủ hồ sơ');
  });

  it('draws progress in a neutral arc, since a missing paper is a to-do and not a problem', () => {
    const { container } = renderInLocale(<CompletenessRing percent={70} missing={3} />);
    expect(arcClass(container)).toContain('stroke-text-secondary');
  });

  it('draws no arc at zero', () => {
    const { container } = renderInLocale(<CompletenessRing percent={0} missing={12} />);
    expect(arcClass(container)).toBeUndefined();
  });
});
