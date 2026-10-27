import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadComposer, type ComposerLabels } from './thread-composer';

const sendQuestion = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();

vi.mock('@/app/(app)/assistant/actions', () => ({ sendQuestion: (raw: unknown) => sendQuestion(raw) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace }) }));

const labels: ComposerLabels = { message: 'Viết cho Trợ lý', placeholder: 'Ví dụ', send: 'Gửi', sending: 'Đang gửi', empty: 'Trống', long: 'Dài', failed: 'Chưa gửi được', busy: 'Trợ lý đang trả lời', deferred: 'Ngày mai' };
const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';
const NOTE_TOPIC = { kind: 'item', itemId: '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c02' } as const;

const send = () => screen.getByTestId('composer-send') as HTMLButtonElement;
const field = () => screen.getByTestId('composer-message') as HTMLTextAreaElement;
const sent = () => sendQuestion.mock.calls.map(([raw]) => raw as Record<string, unknown>);

async function write(message: string) {
  const calls = sendQuestion.mock.calls.length;
  fireEvent.change(field(), { target: { value: message } });
  fireEvent.click(send());
  await waitFor(() => expect(sendQuestion.mock.calls.length).toBe(calls + 1));
  await waitFor(() => expect(send().disabled).toBe(false));
}

describe('the reply box', () => {
  beforeEach(() => {
    sendQuestion.mockReset();
    refresh.mockReset();
    replace.mockReset();
  });

  it('resends a failed message with the same id and no conversation, so a lost reply never asks twice', async () => {
    sendQuestion.mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    render(<ThreadComposer labels={labels} maxLength={2000} state="ready" />);
    await write('Còn tháng 9 thì sao?');
    expect(screen.getByRole('alert').textContent).toBe('Chưa gửi được');
    await write('Còn tháng 9 thì sao?');
    const [first, retry] = sent();
    expect(retry).toEqual(first);
    expect(Object.keys(first ?? {}).toSorted()).toEqual(['deep', 'question', 'questionId', 'topic']);
    expect(first).toMatchObject({ question: 'Còn tháng 9 thì sao?', deep: false, topic: null });
    expect(refresh).toHaveBeenCalledOnce();
    expect(field().value).toBe('');
  });

  it('sends the next message with a new id once the last one went through', async () => {
    sendQuestion.mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    render(<ThreadComposer labels={labels} maxLength={2000} state="ready" />);
    await write('Còn tháng 9 thì sao?');
    await write('Còn tháng 9 thì sao?');
    const [first, second] = sent();
    expect(second?.questionId).not.toBe(first?.questionId);
  });

  it.each([
    ['busy', 'Trợ lý đang trả lời'],
    ['deferred', 'Ngày mai'],
  ] as const)('does not send while %s, and says why', (state, hint) => {
    render(<ThreadComposer labels={labels} maxLength={2000} state={state} />);
    expect(send().disabled).toBe(true);
    expect(screen.getByTestId('composer-hint').textContent).toBe(hint);
  });

  it('refuses an empty message without sending it', () => {
    render(<ThreadComposer labels={labels} maxLength={2000} state="ready" />);
    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.click(send());
    expect(screen.getByRole('alert').textContent).toBe('Trống');
    expect(sendQuestion).not.toHaveBeenCalled();
  });

  it('shows Suy nghĩ kỹ hơn only when the page passes it, and sends the choice', async () => {
    sendQuestion.mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    const { rerender } = render(<ThreadComposer labels={labels} maxLength={2000} state="ready" />);
    expect(screen.queryByTestId('composer-deep')).toBeNull();
    rerender(<ThreadComposer labels={labels} maxLength={2000} state="ready" thinkHarder={{ label: 'Suy nghĩ kỹ hơn', hint: 'Chậm hơn' }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Suy nghĩ kỹ hơn' }));
    await write('Câu hỏi khó');
    expect(sent()[0]?.deep).toBe(true);
  });

  it('sends a reply with its note as the topic, then leaves the URL that named it', async () => {
    sendQuestion.mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    render(<ThreadComposer labels={labels} maxLength={2000} state="ready" topic={{ topic: NOTE_TOPIC, label: 'Trả lời: Phòng 5', clear: 'Bỏ', clearLabel: 'Bỏ chủ đề Phòng 5' }} />);
    expect(screen.getByTestId('composer-topic').textContent).toContain('Trả lời: Phòng 5');
    await write('Khách này trễ mấy lần rồi?');
    expect(sent()[0]?.topic).toEqual(NOTE_TOPIC);
    expect(replace).toHaveBeenCalledWith('/assistant', { scroll: false });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('Bỏ drops the topic by leaving the URL that named it, without sending', () => {
    render(<ThreadComposer labels={labels} maxLength={2000} state="ready" topic={{ topic: NOTE_TOPIC, label: 'Trả lời: Phòng 5', clear: 'Bỏ', clearLabel: 'Bỏ chủ đề Phòng 5' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chủ đề Phòng 5' }));
    expect(replace).toHaveBeenCalledWith('/assistant', { scroll: false });
    expect(sendQuestion).not.toHaveBeenCalled();
  });

  it('one tap on a suggested reply sends its text with its note as the topic, and the chips give way to a topic', async () => {
    sendQuestion.mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    const suggestions = { label: 'Gợi ý trả lời', items: [{ text: 'Viết tin nhắn nhắc Hoàng Văn Em Demo', topic: NOTE_TOPIC }] };
    const { rerender } = render(<ThreadComposer labels={labels} maxLength={2000} state="ready" suggestions={suggestions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Viết tin nhắn nhắc Hoàng Văn Em Demo' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(sent()).toEqual([expect.objectContaining({ question: 'Viết tin nhắn nhắc Hoàng Văn Em Demo', topic: NOTE_TOPIC })]);
    rerender(<ThreadComposer labels={labels} maxLength={2000} state="ready" suggestions={suggestions} topic={{ topic: NOTE_TOPIC, label: 'Trả lời: Phòng 5', clear: 'Bỏ', clearLabel: 'Bỏ chủ đề Phòng 5' }} />);
    expect(screen.queryByTestId('composer-suggestions')).toBeNull();
  });
});
