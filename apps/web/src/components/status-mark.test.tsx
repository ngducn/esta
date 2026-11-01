import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { StatusMark, type StatusMarkProps } from './status-mark';
import { markStatuses } from './status-shape';

const words = {
  paid: 'Đã thu',
  due: 'Đến hạn',
  upcoming: 'Chưa đến hạn',
  overdue: 'Quá hạn 12 ngày',
  vacant: 'Phòng trống',
  draft: 'Bản nháp',
  ended: 'Đã kết thúc',
} as const;

const propsFor = (status: (typeof markStatuses)[number]): StatusMarkProps =>
  status === 'overdue' ? { status, days: 12 } : { status };

describe('StatusMark', () => {
  const iconOf = (status: (typeof markStatuses)[number]) => {
    const { container } = renderInLocale(<StatusMark {...propsFor(status)} />);
    return { container, svg: container.querySelector(`svg[data-shape="${status}"]`) };
  };

  it.each(markStatuses)('renders %s as a hidden icon and a word', (status) => {
    const { container, svg } = iconOf(status);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe(words[status]);
  });

  it('gives every status its own icon, so status reads in grayscale', () => {
    const drawings = markStatuses.map((status) => iconOf(status).svg?.innerHTML);
    expect(drawings.every(Boolean)).toBe(true);
    expect(new Set(drawings).size).toBe(markStatuses.length);
  });
});
