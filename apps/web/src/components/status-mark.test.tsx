import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { markStatuses, StatusMark, statusMarks, type StatusMarkProps } from './status-mark';

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
  it.each(markStatuses)('renders %s as a shape and a word', (status) => {
    const { container } = renderInLocale(<StatusMark {...propsFor(status)} />);
    const svg = container.querySelector(`svg[data-shape="${status}"]`);
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(statusMarks[status].shape.d);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe(words[status]);
  });

  it('gives every status its own shape', () => {
    const shapes = markStatuses.map((status) => JSON.stringify(statusMarks[status].shape));
    expect(new Set(shapes).size).toBe(markStatuses.length);
  });
});
