import { isoDate, type IsoDate } from '@esta/core/date';
import type { EarlierTurn } from '../../src/jobs/ask';
import { askFollowUpPrompt, askPrompt, type AskedTurn } from '../../src/prompts/ask';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, writeRecording, type Recording } from '../../src/replay/store';
import { canonicalInput, replaySessionId } from '../../src/sdk/session';
import { mcpToolName } from '../../src/tools/server';

export type AskCase = {
  readonly id: string;
  readonly question: string;
  readonly toolCalls: ReadonlyArray<{ readonly name: string; readonly input: Record<string, unknown> }>;
  readonly reply: string;
  /** A follow-up names the case it follows and the handle its turn starts at, one past the handles that case gave out. */
  readonly follows?: { readonly id: string; readonly firstHandle: number };
  readonly rebuiltFrom?: readonly AskedTurn[];
  /** The first question of a new segment of the thread, which starts from the last answered turns of her previous segment. */
  readonly seed?: readonly AskedTurn[];
  /** An operator ticked Suy nghĩ kỹ hơn. */
  readonly deep?: true;
  /** The business day it is asked on, when not 2026-10-07: a new segment starts on the next day. */
  readonly today?: IsoDate;
};

const PROPERTIES = { name: mcpToolName('list_properties'), input: {} };
const call = (name: string, input: Record<string, unknown> = {}) => ({ name: mcpToolName(name), input });

export const ASK_CASES: readonly AskCase[] = [
  {
    id: 'q1-di-an-income',
    question: 'Tháng này thu được bao nhiêu từ Dĩ An?',
    toolCalls: [PROPERTIES, { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 10 } }],
    reply: 'Từ đầu tháng {{f8.period_date_display}} đến nay, {{f3.property_label}} đã thu {{f8.income_display}} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của {{f3.property_label}}](f8).',
  },
  {
    id: 'q1-deep',
    question: 'Tháng này thu được bao nhiêu từ Dĩ An?',
    deep: true,
    toolCalls: [PROPERTIES, { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 10 } }],
    reply: 'Từ đầu tháng {{f8.period_date_display}} đến nay, {{f3.property_label}} đã thu {{f8.income_display}} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của {{f3.property_label}}](f8).',
  },
  {
    id: 'q1-follow-up-september',
    question: 'Còn tháng 9 thì sao?',
    follows: { id: 'q1-di-an-income', firstHandle: 9 },
    toolCalls: [PROPERTIES, { name: mcpToolName('ledger'), input: { property: 'f11', year: 2026, month: 9 } }],
    reply: 'Tháng {{f16.period_date_display}}, {{f11.property_label}} đã thu {{f16.income_display}} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của {{f11.property_label}}](f16).',
  },
  {
    id: 'q1-follow-up-september-rebuilt',
    question: 'Còn tháng 9 thì sao?',
    follows: { id: 'q1-di-an-income', firstHandle: 9 },
    rebuiltFrom: [{ question: 'Tháng này thu được bao nhiêu từ Dĩ An?', answer: 'Từ đầu tháng 10/2026 đến nay, Dãy trọ Dĩ An đã thu 1.000.000\u00a0₫ tiền thuê.\n\nXem từng khoản trong sổ thu chi của Dãy trọ Dĩ An.' }],
    toolCalls: [PROPERTIES, { name: mcpToolName('ledger'), input: { property: 'f11', year: 2026, month: 9 } }],
    reply: 'Tháng {{f16.period_date_display}}, {{f11.property_label}} đã thu {{f16.income_display}} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của {{f11.property_label}}](f16).',
  },
  {
    id: 'missing-market-price',
    question: 'Giá thị trường của Đất Bảo Lộc hiện nay là bao nhiêu?',
    toolCalls: [PROPERTIES],
    reply: 'Ứng dụng chưa có giá thị trường hiện nay của {{f1.property_label}}, nên Trợ lý không ước tính con số nào.\n\nKhi có định giá mới, bạn có thể ghi vào hồ sơ của tài sản này.',
  },
  {
    id: 'q2-di-an-overdue',
    question: 'Phòng nào ở Dĩ An đang quá hạn đóng tiền?',
    toolCalls: [PROPERTIES, call('collections', { year: 2026, month: 10, property: 'f3' })],
    reply: 'Ở {{f3.property_label}}, chỉ có {{f8.unit_label}} đang quá hạn đóng tiền: quá hạn {{f8.days_overdue_display}} ngày, còn nợ {{f8.amount_display}}.\n\nXem [hóa đơn của {{f8.unit_label}}](f8).',
  },
  {
    id: 'q3-leases-ending',
    question: 'Hợp đồng nào hết hạn trong 60 ngày tới?',
    toolCalls: [PROPERTIES, call('list_leases', { status: 'active', ends_within_days: 60 })],
    reply: 'Trong thời gian đó có một hợp đồng hết hạn:\n\n| Tài sản | Người thuê | Ngày hết hạn | Còn lại |\n| --- | --- | --- | --- |\n| [{{f8.property_label}}](f8) | {{f8.tenant_name}} | {{f8.end_date_display}} | {{f8.days_until_end_display}} ngày |',
  },
  {
    id: 'q4-deposits-held',
    question: 'Tổng tiền cọc đang giữ là bao nhiêu?',
    toolCalls: [PROPERTIES, call('portfolio_overview')],
    reply: 'Gia đình đang giữ tổng cộng {{f8.deposits_held_display}} tiền cọc của người thuê, tính cả tiền cọc của hợp đồng đã kết thúc mà chưa hoàn lại.',
  },
  {
    id: 'q5-tax-threshold',
    question: 'Doanh thu cho thuê năm nay của mẹ là bao nhiêu, còn cách ngưỡng 500 triệu bao xa?',
    toolCalls: [PROPERTIES, call('tax_position', { year: 2026 })],
    reply: 'Năm {{f8.tax_year_display}}, doanh thu cho thuê tính cho {{f8.owner_name}} đến nay là {{f8.accrued_display}}, dự kiến cả kỳ là {{f8.projected_display}}.\n\nSo với ngưỡng {{f8.threshold_display}}, doanh thu dự kiến còn cách {{f8.remaining_to_threshold_display}} và đã đạt {{f8.threshold_share_display}} ngưỡng. Xem [thông tin thuế của {{f8.owner_name}}](f8).',
  },
  {
    id: 'q6-bien-hoa-vacant',
    question: 'Kho Biên Hòa để trống bao lâu rồi?',
    toolCalls: [PROPERTIES, call('property_metrics', { property: 'f2', year: 2026 })],
    reply: '{{f2.property_label}} đã để trống {{f9.empty_days_display}} ngày, từ ngày {{f8.empty_since_date_display}}.\n\nXem [hồ sơ {{f2.property_label}}](f8).',
  },
  {
    id: 'q7-q7-repairs',
    question: 'Chi phí sửa chữa năm nay của Nhà phố Q7 là bao nhiêu?',
    toolCalls: [PROPERTIES, call('ledger', { property: 'f6', year: 2026 })],
    reply: 'Năm {{f8.period_date_display}}, chi phí sửa chữa của {{f6.property_label}} là {{f9.amount_display}}.\n\nXem từng khoản trong [sổ thu chi của {{f6.property_label}}](f8).',
  },
  {
    id: 'q8-bao-loc-mortgage',
    question: 'Sổ đất Bảo Lộc có đang thế chấp không, ở ngân hàng nào?',
    toolCalls: [PROPERTIES, call('get_property', { property: 'f1' })],
    reply: 'Có. Sổ của {{f1.property_label}} đang thế chấp tại {{f9.mortgage_bank_name}}, khoản vay {{f9.mortgage_amount_display}}, đăng ký ngày {{f9.mortgage_registered_date_display}}.\n\nXem [pháp lý của {{f1.property_label}}](f9).',
  },
  {
    id: 'q9-q1-yield',
    question: 'Lợi suất cho thuê gộp của Mặt bằng Quận 1 là bao nhiêu?',
    toolCalls: [PROPERTIES, call('property_metrics', { property: 'f5', year: 2026 })],
    reply: 'Lợi suất cho thuê gộp của {{f5.property_label}} là {{f8.gross_yield_display}}. Con số này tính trên tiền thuê hằng tháng {{f8.monthly_rent_display}} và giá trị ước tính {{f8.valuation_display}} ngày {{f8.valuation_date_display}}.\n\nXem [hồ sơ {{f5.property_label}}](f8).',
  },
  {
    id: 'q10-late-tenant-english',
    question: 'Which tenant paid late most often this year?',
    toolCalls: [call('payment_behavior', { year: 2026 })],
    reply: '{{f1.tenant_name}} paid late most often this year: {{f1.paid_late_count_display}} of {{f1.invoice_count_display}} bills were paid in full after their due date, on average {{f1.average_days_late_display}} days late.\n\nSee [{{f1.tenant_name}}](f1).',
  },
  {
    id: 'seed10-english-overdue',
    question: 'Which rooms in Dĩ An are overdue?',
    toolCalls: [PROPERTIES, call('collections', { year: 2026, month: 10, property: 'f3' })],
    reply: 'In {{f3.property_label}}, only {{f8.unit_label}} is overdue: {{f8.days_overdue_display}} days late, with {{f8.amount_display}} still owed.\n\nSee [the bill for {{f8.unit_label}}](f8).',
  },
  {
    id: 't1-zalo-reminder',
    question: 'Viết tin nhắn Zalo nhắc khách phòng 5 ở Dĩ An đóng tiền.',
    toolCalls: [PROPERTIES, call('collections', { year: 2026, month: 10, property: 'f3' })],
    reply:
      'Đây là tin nhắn bạn có thể gửi qua Zalo:\n\nChào {{f8.tenant_name}}, tiền thuê {{f8.unit_label}} ở {{f3.property_label}} đến hạn ngày {{f8.due_date_display}} hiện còn {{f8.amount_display}}. Nhờ anh chị sắp xếp đóng giúp sớm. Nếu đã chuyển khoản rồi, anh chị báo lại để mình kiểm tra nhé. Cảm ơn anh chị.',
  },
  {
    id: 't2-rent-by-year',
    question: 'Có nên cho thuê theo năm thay vì theo tháng không?',
    toolCalls: [],
    reply:
      'Cho thuê theo năm giúp nguồn thu ổn định hơn và đỡ phải tìm khách mới, nhưng khó điều chỉnh giá giữa chừng, và nếu khách ngừng trả thì thiệt hại lớn hơn. Cho thuê theo tháng linh hoạt hơn, đổi lại dễ trống phòng và phải thu tiền thường xuyên.\n\nVới khách đã ở lâu và trả đúng hạn, hợp đồng theo năm có điều khoản điều chỉnh giá khi gia hạn thường là lựa chọn an toàn. Nếu muốn, Trợ lý có thể xem lịch sử trả tiền của từng khách để bạn cân nhắc.',
  },
  {
    id: 't8-bao-loc-land-price',
    question: 'Giá đất Bảo Lộc bây giờ khoảng bao nhiêu?',
    toolCalls: [PROPERTIES],
    reply:
      'Ứng dụng chưa có giá đất hiện nay của {{f1.property_label}}, và Trợ lý chưa tra cứu được trên mạng, nên không ước tính con số nào.\n\nNếu bạn có giá từ người môi giới hoặc tin rao gần đây, hãy gửi cho Trợ lý để cùng xem tiếp.',
  },
  {
    id: 'seeded-segment-august',
    question: 'Còn tháng 8 thì sao?',
    today: isoDate('2026-10-08'),
    seed: [
      { question: 'Tháng này thu được bao nhiêu từ Dĩ An?', answer: 'Từ đầu tháng 10/2026 đến nay, Dãy trọ Dĩ An đã thu 1.000.000\u00a0₫ tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/93cc970b-f9c2-52f5-bc34-1f1edb76742c?year=2026&month=10).' },
      { question: 'Còn tháng 9 thì sao?', answer: 'Tháng 9/2026, Dãy trọ Dĩ An đã thu 19.300.000\u00a0₫ tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/93cc970b-f9c2-52f5-bc34-1f1edb76742c?year=2026&month=9).' },
    ],
    toolCalls: [PROPERTIES, { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 8 } }],
    reply: 'Tháng {{f8.period_date_display}}, {{f3.property_label}} đã thu {{f8.income_display}} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của {{f3.property_label}}](f8).',
  },
];

/** The texts a repair prompt says the guard rejected, one `"<text>": <rule>` line each. */
export const rejectedTexts = (repair: string) => repair.split('\n').flatMap((line) => /^"([^"]*)":/u.exec(line)?.[1] ?? []);

export const ASK_CONTEXT = { locale: 'vi', today: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh' } as const;

const canon = () => canonicalizer({ householdName: 'Gia đình Demo' });

export const askCase = (id: string): AskCase => {
  const found = ASK_CASES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no ask case ${id}`);
  return found;
};

export function casePrompt({ question, follows, rebuiltFrom, seed, today = ASK_CONTEXT.today }: AskCase): string {
  const earlier = rebuiltFrom ?? seed;
  if (earlier !== undefined) return askPrompt({ ...ASK_CONTEXT, today, question, earlier });
  return follows === undefined ? askPrompt({ ...ASK_CONTEXT, question }) : askFollowUpPrompt({ today: ASK_CONTEXT.today, timezone: ASK_CONTEXT.timezone, question, firstHandle: follows.firstHandle });
}

/** The turn a follow-up resumes, as the conversation row holds it after the case it follows finished in replay. */
export function caseEarlier({ follows }: AskCase): EarlierTurn | null {
  if (follows === undefined) return null;
  const turnHash = inputHash(caseInput(askCase(follows.id)));
  return { sessionId: replaySessionId(turnHash), turnHash, handles: follows.firstHandle - 1 };
}

export function caseInput(item: AskCase) {
  const earlier = item.rebuiltFrom === undefined ? caseEarlier(item) : null;
  return canonicalInput({ spec: JOBS.ask, prompt: casePrompt(item), canon: canon(), ...(earlier === null ? {} : { resume: { sessionId: earlier.sessionId, afterInputHash: earlier.turnHash } }), ...(item.deep ? { modelRole: 'deep' as const } : {}) });
}

export function askRecording(item: AskCase): Recording {
  const input = caseInput(item);
  return {
    version: 1,
    kind: 'ask',
    inputHash: inputHash(input),
    input,
    label: `Hand-written for ${item.id}${item.follows === undefined ? '' : `, ${item.rebuiltFrom === undefined ? 'resuming' : 'rebuilding the lost session of'} ${item.follows.id}`}${item.seed === undefined ? '' : ', as the first question of a new segment of the thread'} on the full seed at ${item.today ?? ASK_CONTEXT.today} 07:00; the live recording waits for the P5-10 live run.`,
    model: item.deep ? 'hand-written-deep' : 'hand-written',
    numTurns: item.toolCalls.length + 1,
    toolCalls: item.toolCalls.map((call) => ({ ...call })),
    reply: item.reply,
  };
}

if (import.meta.main) {
  for (const item of ASK_CASES) console.log(writeRecording(DEFAULT_REPLAY_DIR, askRecording(item)));
}
