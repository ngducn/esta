import { formatBps, formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { describe, expect, it } from 'vitest';
import { calculateTool } from '../../src/tools/calculate';
import { bpField, runSheet, typedVnd, vndField } from '../../src/tools/fact-sheet';
import { quotePageTool } from '../../src/tools/quote-page';
import { ToolRejection } from '../../src/tools/server';
import { citeTypedNumbers } from '../../src/tools/typed-numbers';
import { fetchedPage, type FetchedPage } from '../../src/tools/web-quotes';

const URL_A = 'https://demo-news.example/lai-suat';
const TEXT = 'Publication date: 05/10/2026\nLãi suất cho vay mua nhà từ 7,5% một năm. Kỳ hạn vay tối đa là hai mươi lăm năm.';

function turn(message = 'Vay 2 tỷ trong 15 năm, lãi 9%/năm thì mỗi tháng trả bao nhiêu?') {
  const { sheet, cite } = runSheet(1);
  const typed = citeTypedNumbers(cite, [message], 'vi');
  const log: Parameters<typeof calculateTool>[0]['log'] = [];
  return { sheet, cite, typed, log, run: calculateTool({ sheet, cite, locale: 'vi', ...(log === undefined ? {} : { log }) }) };
}

describe('calculate', () => {
  it('reads an operand from a tool record, beside its display string', async () => {
    const { cite, run } = turn('Nếu tăng lên 4tr thì sao?');
    const lease = cite({ unit_label: 'Phòng 2', rent_display: '2.500.000 ₫', rent_typed: typedVnd(vnd(2_500_000)) });
    const record = (await run({ op: 'difference', operands: ['f1.value_display', `${lease.handle}.rent_display`] })) as Record<string, unknown>;
    expect(record).toMatchObject({ result_display: '1.500.000 ₫', working_display: '4.000.000 ₫ − 2.500.000 ₫ = 1.500.000 ₫' });
  });

  it('reads the principal, months and rate she typed, listed by handle', async () => {
    const { typed, run } = turn();
    expect(typed.map(({ handle, value_display }) => [handle, value_display])).toEqual([['f1', '2.000.000.000 ₫'], ['f2', '180 tháng'], ['f3', '9%']]);
    const record = (await run({ op: 'loan_payment', operands: ['f1.value_display', 'f3.value_display', 'f2.value_display'] })) as Record<string, unknown>;
    expect(record.result_display).toBe('20.285.332 ₫');
    expect(String(record.working_display)).toContain('2.000.000.000 ₫');
  });

  it('reads the rate from a number in a web quote', async () => {
    const { sheet, cite, run } = turn('Vay 2 tỷ trong 15 năm thì mỗi tháng trả bao nhiêu?');
    const fetched = new Map<string, FetchedPage>();
    const page = fetchedPage({ name: 'WebFetch', input: { url: URL_A }, result: { code: 200, result: TEXT } });
    if (page !== null) for (const url of page.urls) fetched.set(url, page);
    const source = (await quotePageTool({ fetched, cite, locale: 'vi' })({ url: URL_A, quotes: ['cho vay mua nhà từ 7,5% một năm'] })) as Record<string, unknown>;
    expect(source).toMatchObject({ quote_1_value_display: '7,5%' });
    const record = (await run({ op: 'loan_payment', operands: ['f1.value_display', `${String(source.handle)}.quote_1_value_display`, 'f2.value_display'] })) as Record<string, unknown>;
    expect(record.result_display).toBe('18.540.247 ₫');
    expect(sheet.get(String(record.handle))).toBe(record);
  });

  it('refuses a number typed into an operand', async () => {
    const { run } = turn();
    for (const operand of ['4000000', '4tr', 'f1', 'f1.value_typed', 'f9.value_display', 'f1.nothing_display']) {
      await expect(run({ op: 'monthly_to_yearly', operands: [operand] }), operand).rejects.toBeInstanceOf(ToolRejection);
    }
  });

  it('refuses an operand of the wrong kind and names which one', async () => {
    const { run } = turn();
    await expect(run({ op: 'loan_payment', operands: ['f1.value_display', 'f2.value_display', 'f3.value_display'] })).rejects.toThrow('Operand 2 (f2.value_display) is a months, and this operation wants a bp there');
  });

  it('feeds a result to a second calculation and logs both with their operand handles', async () => {
    const { run, log } = turn('Nếu tăng lên 4tr thì sao?');
    const cite = await run({ op: 'monthly_to_yearly', operands: ['f1.value_display'] });
    const first = cite as { handle: string };
    const second = (await run({ op: 'yearly_to_monthly', operands: [`${first.handle}.result_display`] })) as Record<string, unknown>;
    expect(second.result_display).toBe('4.000.000 ₫');
    expect(log?.map(({ handle, operands }) => [handle, operands])).toEqual([['f2', ['f1.value_display']], ['f3', ['f2.result_display']]]);
  });

  it('answers the same call with the same record', async () => {
    const { run } = turn('Nếu tăng lên 4tr thì sao?');
    expect(await run({ op: 'monthly_to_yearly', operands: ['f1.value_display'] })).toBe(await run({ op: 'monthly_to_yearly', operands: ['f1.value_display'] }));
  });

  it('B1 lists no rate for a monthly rate, and works the loan out from the yearly rate she then types', async () => {
    const monthly = turn('Vay 2 tỷ trong 15 năm, lãi 0,8% một tháng thì mỗi tháng trả bao nhiêu?');
    expect(monthly.typed.map(({ value_typed }) => (value_typed as { kind: string }).kind)).toEqual(['vnd', 'months']);
    const yearly = turn('Vay 2 tỷ trong 15 năm, lãi 9,6%/năm thì mỗi tháng trả bao nhiêu?');
    const record = (await yearly.run({ op: 'loan_payment', operands: ['f1.value_display', 'f3.value_display', 'f2.value_display'] })) as Record<string, unknown>;
    expect(record.result_display).toBe('21.005.345\u00a0₫');
  });
});

describe('the display and typed fields of a read tool (L5)', () => {
  it('come from one value, in both languages', () => {
    for (const locale of ['vi', 'en'] as const) {
      const rent = vndField('rent', vnd(2_500_000), locale);
      expect(rent).toEqual({ rent_display: formatVnd(vnd(2_500_000), locale), rent_typed: { kind: 'vnd', value: 2_500_000 } });
      expect(bpField('yield', 625, locale)).toEqual({ yield_display: formatBps(625, locale), yield_typed: { kind: 'bp', value: 625 } });
    }
    expect(vndField('rent', null, 'vi')).toEqual({ rent_display: null, rent_typed: null });
  });
});
