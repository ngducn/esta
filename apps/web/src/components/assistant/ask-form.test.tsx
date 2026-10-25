import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskForm, type AskFormLabels } from './ask-form';

const sendQuestion = vi.fn();
const refresh = vi.fn();

vi.mock('@/app/(app)/assistant/ask/actions', () => ({ sendQuestion: (raw: unknown) => sendQuestion(raw) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const labels: AskFormLabels = { question: 'Hỏi tiếp', placeholder: 'Ví dụ', send: 'Hỏi', sending: 'Đang gửi', empty: 'Trống', long: 'Dài', failed: 'Chưa gửi được', busy: 'Đang trả lời' };
const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';

const send = () => screen.getByTestId('ask-send') as HTMLButtonElement;
const field = () => screen.getByTestId('ask-question') as HTMLTextAreaElement;
const sent = () => sendQuestion.mock.calls.map(([raw]) => raw as { id: string; questionId: string; question: string; deep: boolean });

async function ask(question: string) {
  const calls = sendQuestion.mock.calls.length;
  fireEvent.change(field(), { target: { value: question } });
  fireEvent.click(send());
  await waitFor(() => expect(sendQuestion.mock.calls.length).toBe(calls + 1));
  await waitFor(() => expect(send().disabled).toBe(false));
}

describe('the follow-up box', () => {
  beforeEach(() => {
    sendQuestion.mockReset();
    refresh.mockReset();
  });

  it('resends a failed question with the same ids, so a send whose reply was lost never asks twice', async () => {
    sendQuestion.mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    render(<AskForm labels={labels} maxLength={2000} conversationId={CONVERSATION} />);
    await ask('Còn tháng 9 thì sao?');
    expect(screen.getByRole('alert').textContent).toBe('Chưa gửi được');
    await ask('Còn tháng 9 thì sao?');
    const [first, retry] = sent();
    expect(retry).toEqual(first);
    expect(first).toMatchObject({ id: CONVERSATION, question: 'Còn tháng 9 thì sao?', deep: false });
    expect(refresh).toHaveBeenCalledOnce();
    expect(field().value).toBe('');
  });

  it('asks the next question with a new id once the last one went through', async () => {
    sendQuestion.mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    render(<AskForm labels={labels} maxLength={2000} conversationId={CONVERSATION} />);
    await ask('Còn tháng 9 thì sao?');
    await ask('Còn tháng 9 thì sao?');
    const [first, second] = sent();
    expect(second?.questionId).not.toBe(first?.questionId);
  });

  it('stays closed while the last answer streams, and says why', () => {
    render(<AskForm labels={labels} maxLength={2000} conversationId={CONVERSATION} busy />);
    expect(send().disabled).toBe(true);
    expect(screen.getByTestId('ask-busy').textContent).toBe('Đang trả lời');
  });

  it('shows Suy nghĩ kỹ hơn only when the page passes it, and sends the choice', async () => {
    sendQuestion.mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    const { rerender } = render(<AskForm labels={labels} maxLength={2000} conversationId={CONVERSATION} />);
    expect(screen.queryByTestId('ask-deep')).toBeNull();
    rerender(<AskForm labels={labels} maxLength={2000} conversationId={CONVERSATION} thinkHarder={{ label: 'Suy nghĩ kỹ hơn', hint: 'Chậm hơn' }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Suy nghĩ kỹ hơn' }));
    await ask('Câu hỏi khó');
    expect(sent()[0]?.deep).toBe(true);
  });
});
