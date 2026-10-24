import { render } from '@testing-library/react';
import { onScreenText, readableText } from '@esta/core/guard';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './safe-markdown';

const renderMarkdown = (markdown: string) => render(<SafeMarkdown>{markdown}</SafeMarkdown>).container;

describe('SafeMarkdown', () => {
  it('renders a script tag as text and runs nothing', () => {
    const container = renderMarkdown('Trước <script>alert(1)</script> sau');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('drops the href of a javascript: link and keeps its text', () => {
    const container = renderMarkdown('[bấm](javascript:alert(1))');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('bấm');
  });

  it('drops the href of an http: link', () => {
    const container = renderMarkdown('[nguồn](http://example.com/tin)');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('nguồn');
  });

  it('keeps an https: link and opens it in a new tab without an opener', () => {
    const link = renderMarkdown('[nguồn](https://baochinhphu.vn/tin)').querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://baochinhphu.vn/tin');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps an esta://property link as an in-app link', () => {
    const link = renderMarkdown('[Nhà phố Q7](esta://property/7c9e6679-7425-40de-944b-e07fc1f90ae7)').querySelector('a');
    expect(link?.getAttribute('href')).toBe('/properties/7c9e6679-7425-40de-944b-e07fc1f90ae7');
    expect(link?.getAttribute('target')).toBeNull();
  });

  it('drops an image so a reply cannot load a remote URL', () => {
    const container = renderMarkdown('![ảnh](https://example.com/pixel.png)');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders bold and lists', () => {
    const container = renderMarkdown('**Cần làm**\n\n- Phòng 5\n- Phòng 7');
    expect(container.querySelector('strong')?.textContent).toBe('Cần làm');
    expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual(['Phòng 5', 'Phòng 7']);
  });
});

describe('the number guard reads what SafeMarkdown shows', () => {
  it.each([
    '**25** triệu',
    '25 *triệu*',
    '`25` triệu',
    '**5**.000.000 ₫',
    '5\\.000\\.000 ₫',
    '25\ntriệu',
    'Dòng một  \nDòng hai 12 ngày',
    '5<!-- -->000.000 ₫',
    'Trước <b onclick="x()">3 tr</b> sau',
    'Trước ![5 tỷ](https://example.com/a.png) sau',
    '[Phòng 5](esta://property/3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f) quá hạn',
    '[nguồn 2026](http://example.com/tin)',
    '# Tiêu đề 7/10\n\nĐoạn 1,2 tỷ\n\n- mục 3\n- mục 4\n\n> trích 5%',
    '1. Phòng 5\n2. Phòng 7',
    '```\n15.000.000 ₫\n```',
    '[ref 9]\n\n[ref 9]: https://example.com/9',
    'a​5 000 ₫',
  ])('reads %j as the rendered text', (markdown) => {
    expect(onScreenText(markdown)).toBe(readableText(renderMarkdown(markdown).textContent ?? ''));
  });

  it('reads the numbers of an ordered list that does not start at 1', () => {
    const list = renderMarkdown('13. Phòng 5\n14. Phòng 7').querySelector('ol');
    expect(list?.getAttribute('start')).toBe('13');
    expect(onScreenText('13. Phòng 5\n14. Phòng 7')).toBe('13. Phòng 5 14. Phòng 7');
  });
});
