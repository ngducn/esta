import { describe, expect, it } from 'vitest';
import { renderInLocale } from '@/test/render';
import { AddressBlock } from './address-block';

const lines = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-line]')].map((line) => [line.querySelector('dt')?.textContent, line.querySelector('dd')?.textContent]);

describe('AddressBlock', () => {
  it('shows Hiện nay and Theo sổ when the addresses differ', () => {
    const { container } = renderInLocale(
      <AddressBlock legal="12 Lý Thường Kiệt, Phường 7, Quận 10, TP. Hồ Chí Minh" current="12 Lý Thường Kiệt, Phường Diên Hồng, TP. Hồ Chí Minh" />,
    );
    expect(lines(container)).toEqual([
      ['Hiện nay', '12 Lý Thường Kiệt, Phường Diên Hồng, TP. Hồ Chí Minh'],
      ['Theo sổ', '12 Lý Thường Kiệt, Phường 7, Quận 10, TP. Hồ Chí Minh'],
    ]);
  });

  it('collapses to one line when the addresses match apart from spacing and normalization', () => {
    const legal = '5 Hàng Bạc, Phường Hoàn Kiếm, Hà Nội';
    const { container } = renderInLocale(<AddressBlock legal={`  ${legal.normalize('NFD')} `} current={legal.replace(' ', '  ')} />);
    expect(lines(container)).toEqual([['Theo sổ và hiện nay', legal.replace(' ', '  ')]]);
  });

  it('says there is no address when both are missing', () => {
    const { container } = renderInLocale(<AddressBlock legal={null} current={null} />);
    expect(container.textContent).toBe('Chưa có địa chỉ');
  });
});
