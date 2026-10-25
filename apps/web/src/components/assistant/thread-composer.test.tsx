import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadComposer, type ComposerLabels } from './thread-composer';

const sendQuestion = vi.fn();
const refresh = vi.fn();

vi.mock('@/app/(app)/assistant/actions', () => ({ sendQuestion: (raw: unknown) => sendQuestion(raw) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const labels: ComposerLabels = { message: 'Viết cho Trợ lý', placeholder: 'Ví dụ', send: 'Gửi', sending: 'Đang gửi', empty: 'Trống', long: 'Dài', failed: 'Chưa gửi được', busy: 'Trợ lý đang trả lời', deferred: 'Ngày mai' };
const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';

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
  });

  it('resends a failed message with the same id and no conversation, so a lost reply never asks twice', async () => {
    sendQuestion.mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValue({ ok: true, value: { id: CONVERSATION } });
    render(<ThreadComposer labels={labels} maxLength={2000} state="ready" />);
    await write('Còn tháng 9 thì sao?');
    expect(screen.getByRole('alert').textContent).toBe('Chưa gửi được');
    await write('Còn tháng 9 thì sao?');
    const [first, retry] = sent();
    expect(retry).toEqual(first);
    expect(Object.keys(first ?? {}).toSorted()).toEqual(['deep', 'question', 'questionId']);
    expect(first).toMatchObject({ question: 'Còn tháng 9 thì sao?', deep: false });
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
});
