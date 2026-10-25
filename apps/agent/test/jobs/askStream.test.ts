import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerStream, FLUSH_MS, resolveLinks } from '../../src/jobs/askStream';

const LEDGER = 'esta://ledger/93cc970b-f9c2-52f5-bc34-1f1edb76742c';
const sheet = new Map<string, Record<string, unknown>>([
  ['f1', { handle: 'f1', property_label: 'Dãy trọ Dĩ An' }],
  ['f2', { handle: 'f2', income_display: '1.000.000 ₫', period_date_display: '10/2026', link: LEDGER }],
  ['f3', { handle: 'f3', property_label: 'Nhà [góc](f2)' }],
]);

function stream() {
  const writes: string[] = [];
  const refs: Array<readonly string[]> = [];
  const answer = answerStream({
    sheet,
    write: async (written) => {
      writes.push(written.content);
      refs.push(written.refs);
    },
  });
  return { answer, writes, refs };
}

async function pushAll(answer: ReturnType<typeof stream>['answer'], chunks: readonly string[]) {
  for (const chunk of chunks) {
    await answer.push(chunk);
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the streamed answer guard (AGENT.md §5.6)', () => {
  it('shows nothing until a sentence ends, then that sentence filled from the tools', async () => {
    const { answer, writes } = stream();
    await pushAll(answer, ['Tháng {{f2.period', '_date_display}}, {{f1.property_label}} đã thu']);
    expect(writes).toEqual([]);
    await pushAll(answer, [' {{f2.income_display}}. Xem', ' thêm']);
    expect(writes).toEqual(['Tháng 10/2026, Dãy trọ Dĩ An đã thu 1.000.000 ₫.']);
  });

  it('never writes a placeholder cut across two chunks, at any cut', async () => {
    const text = 'Đã thu {{f2.income_display}} trong tháng {{f2.period_date_display}}. Còn {{f1.property_label}} thì sao? Hết.';
    for (let cut = 1; cut < text.length; cut += 1) {
      const { answer, writes } = stream();
      await pushAll(answer, [text.slice(0, cut), text.slice(cut)]);
      const ended = await answer.end();
      expect(ended.ok).toBe(true);
      expect(writes.join('\n')).not.toMatch(/\{|\}/);
    }
  });

  it('holds back a violating sentence and everything after it, and the end names the violation', async () => {
    const { answer, writes } = stream();
    await pushAll(answer, ['Đã thu {{f2.income_display}}. ', 'Còn khoảng hai triệu nữa. ', 'Tháng sau sẽ đủ. ']);
    expect(writes).toEqual(['Đã thu 1.000.000 ₫.']);
    const ended = await answer.end();
    expect(ended.ok).toBe(false);
    if (!ended.ok) expect(ended.reason.map(({ text }) => text)).toContain('hai');
    expect(writes).toEqual(['Đã thu 1.000.000 ₫.']);
  });

  it('writes at most once every 300 ms, the latest text winning', async () => {
    const { answer, writes } = stream();
    await answer.push('Đã thu. ');
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(['Đã thu.']);
    await vi.advanceTimersByTimeAsync(100);
    await answer.push('Còn nợ. ');
    await answer.push('Hết hạn. ');
    await vi.advanceTimersByTimeAsync(FLUSH_MS - 101);
    expect(writes).toEqual(['Đã thu.']);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual(['Đã thu.', 'Đã thu. Còn nợ. Hết hạn.']);
  });

  it('after restart, the repair answer replaces what the row shows', async () => {
    const { answer, writes } = stream();
    await pushAll(answer, ['Đã thu {{f2.income_display}}. Khoảng ba triệu. ']);
    expect((await answer.end()).ok).toBe(false);
    answer.restart();
    await pushAll(answer, ['{{f1.property_label}} đã thu {{f2.income_display}}.']);
    const ended = await answer.end();
    expect(ended.ok && ended.value.text).toBe('Dãy trọ Dĩ An đã thu 1.000.000 ₫.');
    expect(writes.at(-1)).toBe('Dãy trọ Dĩ An đã thu 1.000.000 ₫.');
  });
});

describe('the stream against the review of the first Hỏi PR (#335)', () => {
  it('counts the resolved links against the length limit, so a long answer fails the guard and never the database check', async () => {
    const { answer, writes } = stream();
    await pushAll(answer, Array.from({ length: 70 }, () => 'Xem [sổ](f2). '));
    const ended = await answer.end();
    expect(ended.ok).toBe(false);
    if (!ended.ok) expect(ended.reason.map(({ rule }) => rule)).toEqual(['too_long']);
    expect(writes.length).toBeGreaterThan(0);
    expect(Math.max(...writes.map((content) => content.length))).toBeLessThanOrEqual(4000);
  });

  it('counts only the template the model wrote against the 3,000-character limit, and the resolved links against the 4,000 one', async () => {
    const { answer } = stream();
    await pushAll(answer, Array.from({ length: 60 }, () => 'Xem [sổ](f2). '));
    const ended = await answer.end();
    expect(ended.ok).toBe(true);
    if (ended.ok) expect(ended.value.text.length).toBeGreaterThan(3000);
  });

  it.each([
    '| Tài sản | Đã thu |\n| --- | --- |\n| [Dĩ An](q|25) |',
    '| Tài sản | Còn lại |\n| --- | --- |\n| [Thủ Đức](<x|25 ngày>) |',
    '| [Tài sản](x|2026) | Ghi chú |\n| --- | --- | --- |\n| a | b | c |',
  ])('rejects %j, whose table cell shows a number the link target hid from a reading without tables', async (table) => {
    const { answer, writes } = stream();
    await pushAll(answer, [table]);
    const ended = await answer.end();
    expect(ended.ok).toBe(false);
    if (!ended.ok) expect(ended.reason.map(({ rule }) => rule)).toContain('number');
    expect(writes.join('\n')).not.toMatch(/\d/);
  });

  it('leaves a cited name that holds `](f2)` as text and links nothing through it', async () => {
    const { answer } = stream();
    await pushAll(answer, ['Xem {{f3.property_label}}.']);
    const ended = await answer.end();
    expect(ended.ok && ended.value).toMatchObject({ text: 'Xem Nhà \\[góc\\](f2).', refs: [] });
  });

  it('keeps streaming a numbered list after a line that ends in a colon', async () => {
    const { answer, writes } = stream();
    await pushAll(answer, ['Có các khoản sau:\n1.', ' Tiền thuê {{f2.income_display}}.\n2.', ' Tiền điện.']);
    expect(writes.at(-1)).toBe('Có các khoản sau:\n1. Tiền thuê 1.000.000 ₫.');
  });

  it('writes the links of the text it shows with that text, and nothing it did not swap in', async () => {
    const { answer, writes, refs } = stream();
    await pushAll(answer, ['Xem [sổ](f2). Xem [khác](esta://property/7c9e6679-7425-40de-944b-e07fc1f90ae7). Hết.']);
    expect(writes.at(-1)).toContain(`[sổ](${LEDGER})`);
    expect(refs.at(-1)).toEqual([LEDGER]);
  });

  it('streams a table row by row as it arrives', async () => {
    const { answer, writes } = stream();
    await pushAll(answer, ['| Tài sản | Đã thu |\n| --- | --- |\n', '| [{{f1.property_label}}](f2) | {{f2.income_display}} |\n']);
    const ended = await answer.end();
    expect(ended.ok && ended.value.text).toBe(`| Tài sản | Đã thu |\n| --- | --- |\n| [Dãy trọ Dĩ An](${LEDGER}) | 1.000.000 ₫ |`);
    expect(writes.at(-1)).toBe(ended.ok ? ended.value.text : '');
  });
});

describe('handle links in an answer', () => {
  it('turn a handle of this run into its record\'s esta:// link', () => {
    expect(resolveLinks('Xem [sổ thu chi](f2).', sheet)).toEqual({ text: `Xem [sổ thu chi](${LEDGER}).`, refs: [LEDGER] });
  });

  it('leave a handle this run never returned, or a record without a link, as a bare word', () => {
    expect(resolveLinks('Xem [sổ](f99) và [tài sản](f1).', sheet)).toEqual({ text: 'Xem [sổ](f99) và [tài sản](f1).', refs: [] });
  });
});
