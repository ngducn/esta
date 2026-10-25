import { visibleText } from '@esta/core/guard';
import { render } from '@testing-library/react';
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

  it.each(['property', 'invoice', 'lease', 'unit', 'document', 'party', 'meter', 'ledger'])('opens an esta://%s link inside the app', (type) => {
    const link = renderMarkdown(`[Phòng 5](esta://${type}/7c9e6679-7425-40de-944b-e07fc1f90ae7)`).querySelector('a');
    expect(link?.getAttribute('href')).toBe(`/open/${type}/7c9e6679-7425-40de-944b-e07fc1f90ae7`);
    expect(link?.getAttribute('target')).toBeNull();
  });

  it.each(['esta://tenant/7c9e6679-7425-40de-944b-e07fc1f90ae7', 'esta://invoice/../settings'])('keeps only the text of %s', (url) => {
    const container = renderMarkdown(`[Phòng 5](${url})`);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('Phòng 5');
  });

  const LEDGER = 'esta://ledger/7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const answer = (markdown: string, refs: readonly string[] = [LEDGER]) => render(<SafeMarkdown refs={refs}>{markdown}</SafeMarkdown>).container;

  it.each(['https://baochinhphu.vn/tin', 'f99', 'f3', 'esta://property/7c9e6679-7425-40de-944b-e07fc1f90ae7'])('in an answer, keeps only the text of a link to %s, which its run never looked up', (url) => {
    const container = answer(`[sổ thu chi](${url})`);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('sổ thu chi');
  });

  it('in an answer, opens a link its run looked up inside the app', () => {
    expect(answer(`[sổ thu chi](${LEDGER})`).querySelector('a')?.getAttribute('href')).toBe('/open/ledger/7c9e6679-7425-40de-944b-e07fc1f90ae7');
  });

  it('in an answer, renders a table, and a bare URL in it stays text', () => {
    const container = answer(`| Tài sản | Đã thu |\n| --- | ---: |\n| [Dĩ An](${LEDGER}) | 1.000.000 ₫ https://x.vn |`);
    expect([...container.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['Tài sản', 'Đã thu']);
    expect([...container.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual(['Dĩ An', '1.000.000 ₫ https://x.vn']);
    expect([...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(['/open/ledger/7c9e6679-7425-40de-944b-e07fc1f90ae7']);
  });

  it('outside an answer, a table stays its literal text', () => {
    const container = renderMarkdown('| Tài sản | Đã thu |\n| --- | --- |\n| Dĩ An | Có |');
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('| Tài sản | Đã thu |');
  });

  it('shows a heading, a quote and code as plain text', () => {
    const container = renderMarkdown('## Tiêu đề\n\n> trích\n\n`mã`');
    expect(container.querySelector('h2, blockquote, code')).toBeNull();
    expect(container.textContent).toContain('Tiêu đề');
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

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();

describe('the number guard reads what SafeMarkdown shows', () => {
  it.each([
    '**25** triệu',
    '- Phòng 5\n- 500.000 ₫',
    '## Phòng 5\n\n12 ngày',
    '25 *triệu*',
    '`25` triệu',
    '5\\.000\\.000 ₫',
    '25\ntriệu',
    'Dòng một  \nDòng hai 12 ngày',
    '5<!-- -->000.000 ₫',
    'Trước <b onclick="x()">3 tr</b> sau',
    'Quá hạn <b>&#x202E;</b> ngày',
    '&#53;&#48; triệu &nbsp;25 5&shy;000 ₫ &rlm;',
    '[Phòng 5](esta://property/3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f) quá hạn',
    '[nguồn 2026](http://example.com/tin) <https://x.com/25>',
    '# Tiêu đề 7/10\n\nĐoạn 1,2 tỷ\n\n- mục 3\n- mục 4\n\n> trích 5%',
    '1. Phòng 5\n2. Phòng 7',
    '```\n15.000.000 ₫\n```',
    '    code 5\n\n~~~\n25\n~~~',
    '[ref 9]\n\n[ref 9]: https://example.com/9',
    '<img src="x" alt="5 tỷ"> <br/>25 <table><tr><td>25</td></tr></table>',
    '<div>\n- 25\n</div>\n\n<details><summary>5</summary>25 tỷ</details>',
    '<!--\n25\n-->\n\nx <!-- 25 --> y <?php 25 ?> <![CDATA[25]]>',
    '- a\n  - 5\n  - 6\n\n> 1. a',
    '***25*** _25_ triệu __25__triệu 2*5*0 \\*25',
    'Heading\n---\n25\n\n# 25 #\n\n#25',
    'a\u0000b 25',
    '25 \u200Btriệu 25\u00A0triệu a\u200Ef\u200E12',
  ])('reads %j as the rendered text', (markdown) => {
    expect(collapse(visibleText(markdown))).toBe(collapse(renderMarkdown(markdown).textContent ?? ''));
  });

  it('reads the numbers of an ordered list that does not start at 1', () => {
    const list = renderMarkdown('13. Phòng 5\n14. Phòng 7').querySelector('ol');
    expect(list?.getAttribute('start')).toBe('13');
    expect(visibleText('13. Phòng 5\n14. Phòng 7')).toBe('13.\nPhòng 5\n14.\nPhòng 7');
  });

  it.each([
    '| Tài sản | Đã thu |\n| --- | ---: |\n| Dĩ An | 25 |',
    '| a |\n| --- |\n| x | 5 tỷ |',
    'a | b\n- | -\n25 | 5',
    '| a \\| 5 | b |\n|---|---|\n| `25` | **3** tr |',
    '| a |\n|:-:|\n    | 25 |\n> 5',
  ])('reads the answer table %j as literal text, which shows every word the table renders', (markdown) => {
    const read = collapse(visibleText(markdown));
    const shown = render(<SafeMarkdown refs={[]}>{markdown}</SafeMarkdown>).container;
    for (const cell of shown.querySelectorAll('th, td, p, li')) for (const word of collapse(cell.textContent ?? '').split(' ').filter(Boolean)) expect(read).toContain(word);
  });

  it.each([
    ['Trước ![5 tỷ](https://example.com/a.png) sau', '5 tỷ'],
    ['Xem [nguồn](https://x "12 triệu")', '12 triệu'],
    ['![a](https://x/a.png "3 tr")', '3 tr'],
    ["[a]\n\n[a]: <https://x> '5 tỷ'", '5 tỷ'],
    ['```js 25 tỷ\nx\n```', 'js 25 tỷ'],
  ])('reads %j as everything rendered plus %j, which another renderer may show', (markdown, hidden) => {
    const read = collapse(visibleText(markdown));
    for (const word of collapse(renderMarkdown(markdown).textContent ?? '').split(' ')) expect(read).toContain(word);
    expect(read).toContain(hidden);
  });
});
