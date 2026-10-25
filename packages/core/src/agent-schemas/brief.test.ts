import { describe, expect, it } from 'vitest';
import { visibleText } from '../guard';
import { BRIEF_SECTIONS, briefDraftSchema, briefTokens, briefV1Schema, renderBriefMarkdown, type BriefV1 } from './brief';

const link = (n: number) => `esta://invoice/00000000-0000-4000-8000-00000000000${n}`;
const brief = (patch: Partial<BriefV1> = {}): BriefV1 => ({
  locale: 'vi',
  summary: 'Sáng nay có một khoản quá hạn.',
  todo: [{ text: 'Phòng 5 quá hạn 12 ngày', link: link(1) }],
  watch: [{ text: 'Kho Biên Hòa để trống 70 ngày', link: link(2) }],
  market: [],
  missing_inputs: [],
  ...patch,
});

const market = (patch: Partial<BriefV1['market'][number]['source']> = {}) => ({ text: 'Sắp khởi công Vành đai 3 qua Phường Dĩ An', source: { name: 'Tin tức Demo', date: '05/10/2026', url: 'https://tintuc.example.vn/vanh-dai-3', ...patch } });

describe('renderBriefMarkdown', () => {
  it('writes each section with lines under its bold heading, in BRIEF_SECTIONS order, skipping empty ones', () => {
    const markdown = renderBriefMarkdown(brief({ missing_inputs: ['Chưa có tin thị trường hôm nay.'] }));
    expect(markdown).toBe(
      [`**Cần làm**`, '', `- [Phòng 5 quá hạn 12 ngày](${link(1)})`, '', `**Theo dõi**`, '', `- [Kho Biên Hòa để trống 70 ngày](${link(2)})`, '', '**Còn thiếu**', '', '- Chưa có tin thị trường hôm nay.'].join('\n'),
    );
  });

  it('heads the sections in English for an English household', () => {
    expect(visibleText(renderBriefMarkdown(brief({ locale: 'en' })))).toMatch(/^To do\n[^]*\nKeep an eye on\n/);
  });

  it('keeps the order data-driven: the headings follow BRIEF_SECTIONS', () => {
    const headings = [...renderBriefMarkdown(brief({ market: [market()], missing_inputs: ['Thiếu'] })).matchAll(/^\*\*(.+)\*\*$/gm)].map(([, heading]) => heading);
    expect(headings).toEqual(BRIEF_SECTIONS.map(({ heading }) => heading.vi));
  });

  it('ends each market line with its source chip, a link to the article that names the source and its date', () => {
    const markdown = renderBriefMarkdown(brief({ todo: [], watch: [], market: [market({ name: 'Báo [Demo]' })] }));
    expect(markdown).toBe('**Thị trường**\n\n- Sắp khởi công Vành đai 3 qua Phường Dĩ An [Báo \\[Demo\\] · 05/10/2026](<https://tintuc.example.vn/vanh-dai-3>)');
    expect(visibleText(markdown)).toBe('Thị trường\nSắp khởi công Vành đai 3 qua Phường Dĩ An Báo [Demo] · 05/10/2026');
  });

  it('shows Markdown punctuation in a line as written, so a value cannot open a link or bold text', () => {
    const shown = visibleText(renderBriefMarkdown(brief({ todo: [{ text: '**Nhà** [x](https://evil.test) <b>3</b> _a_', link: link(1) }], watch: [] })));
    expect(shown).toBe('Cần làm\n**Nhà** [x](https://evil.test) <b>3</b> _a_');
  });
});

describe('briefV1Schema', () => {
  it('accepts a brief of 300 words and rejects one of 301', () => {
    const words = (count: number) => Array.from({ length: count }, () => 'chữ').join(' ');
    const padded = (text: string) => brief({ watch: [{ text, link: link(9) }] });
    const base = briefTokens(padded('x'));
    expect(briefV1Schema.safeParse(padded(words(300 - base + 1))).success).toBe(true);
    const over = briefV1Schema.safeParse(padded(words(301 - base + 1)));
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.message).toBe('301 words > 300');
  });

  it('rejects a summary longer than the 300 characters a title holds', () => {
    expect(briefV1Schema.safeParse(brief({ summary: 'a'.repeat(301) })).success).toBe(false);
  });

  it('rejects a line whose link is not an esta:// record link', () => {
    expect(briefV1Schema.safeParse(brief({ todo: [{ text: 'Phòng 5', link: 'https://example.com' }] })).success).toBe(false);
  });

  it('counts the source chips toward the 300 words, and holds a market source to an https link', () => {
    expect(briefTokens(brief({ todo: [], watch: [], market: [market()] }))).toBe(briefTokens(brief({ todo: [], watch: [] })) + 2 + 10 + 5);
    expect(briefV1Schema.safeParse(brief({ market: [market({ url: 'http://tintuc.example.vn/a' })] })).success).toBe(false);
    expect(briefV1Schema.safeParse(brief({ market: [market({ url: 'https://a.vn/x> [y](z' })] })).success).toBe(false);
  });

  it('holds at most five lines to do, five to watch and three of market news', () => {
    const six = Array.from({ length: 6 }, () => ({ text: 'a', link: link(1) }));
    expect(briefV1Schema.safeParse(brief({ todo: six })).success).toBe(false);
    expect(briefV1Schema.safeParse(brief({ watch: six })).success).toBe(false);
    expect(briefV1Schema.safeParse(brief({ market: [market(), market(), market(), market()] })).success).toBe(false);
  });
});

describe('briefDraftSchema', () => {
  it('refuses a line break in a line, and market lines until a tool returns market news', () => {
    expect(briefDraftSchema.safeParse({ summary: 'Tóm tắt', todo: [], watch: [], market: [] }).success).toBe(false);
    expect(briefDraftSchema.safeParse({ summary: 'Tóm tắt', todo: [{ text: 'a\nb', related: ['f1'] }], watch: [] }).success).toBe(false);
  });
});
