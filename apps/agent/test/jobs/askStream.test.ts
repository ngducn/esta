import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerStream, FLUSH_MS, resolveLinks } from '../../src/jobs/askStream';

const LEDGER = 'esta://ledger/93cc970b-f9c2-52f5-bc34-1f1edb76742c';
const sheet = new Map<string, Record<string, unknown>>([
  ['f1', { handle: 'f1', property_label: 'Dãy trọ Dĩ An' }],
  ['f2', { handle: 'f2', income_display: '1.000.000 ₫', period_date_display: '10/2026', link: LEDGER }],
]);

function stream() {
  const writes: string[] = [];
  const answer = answerStream({ sheet, write: async (content) => void writes.push(content) });
  return { answer, writes };
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

describe('handle links in an answer', () => {
  it('turn a handle of this run into its record\'s esta:// link', () => {
    expect(resolveLinks('Xem [sổ thu chi](f2).', sheet)).toEqual({ text: `Xem [sổ thu chi](${LEDGER}).`, refs: [LEDGER] });
  });

  it('leave a handle this run never returned, or a record without a link, as a bare word', () => {
    expect(resolveLinks('Xem [sổ](f99) và [tài sản](f1).', sheet)).toEqual({ text: 'Xem [sổ](f99) và [tài sản](f1).', refs: [] });
  });
});
