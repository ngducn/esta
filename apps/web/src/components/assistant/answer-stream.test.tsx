import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerStream } from './answer-stream';
import type { AnswerLabels } from './answer-view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/dynamic', () => ({ default: () => ({ children }: { children: string }) => <p>{children}</p> }));

class FakeSource {
  static readonly CLOSED = 2;
  static last: FakeSource | undefined;
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  close() {
    this.readyState = FakeSource.CLOSED;
  }
}

const labels: AnswerLabels = { streaming: 'Đang trả lời', error: 'Chưa trả lời được', stalled: 'Đứt kết nối' };
const ID = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c02';
const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';

function stream() {
  render(<AnswerStream id={ID} conversationId={CONVERSATION} initial={{ content: '', status: 'streaming', refs: [] }} labels={labels} />);
  const source = FakeSource.last;
  if (source === undefined) throw new Error('the answer opens its stream');
  return {
    send: (event: unknown) => act(() => source.onmessage?.({ data: JSON.stringify(event) })),
    drop: (readyState: number) =>
      act(() => {
        source.readyState = readyState;
        source.onerror?.();
      }),
  };
}

const status = () => screen.getByTestId('answer').dataset.status;

describe('an answer streaming on its page', () => {
  beforeEach(() => {
    refresh.mockReset();
    FakeSource.last = undefined;
    vi.stubGlobal('EventSource', FakeSource);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('refreshes the page once it is done, which is what opens the follow-up box', () => {
    const { send } = stream();
    send({ content: 'Tháng 9', status: 'streaming', refs: [] });
    expect(refresh).not.toHaveBeenCalled();
    send({ content: 'Tháng 9 thu 12.000.000 ₫.', status: 'done', refs: [] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(status()).toBe('done');
  });

  it('refreshes the page when the answer fails, so she can ask again', () => {
    const { send } = stream();
    send({ content: '', status: 'error', refs: [] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('answer-line').textContent).toBe(labels.error);
  });

  it('keeps the follow-up box as it is when the stream times out, since the answer is still running', () => {
    const { send } = stream();
    send({ status: 'timeout' });
    expect(refresh).not.toHaveBeenCalled();
    expect(status()).toBe('stalled');
  });

  it('shows the stalled line when the browser gives up on the stream, and not while it reconnects', () => {
    const { send, drop } = stream();
    send({ content: 'Tháng 9', status: 'streaming', refs: [] });
    drop(0);
    expect(status()).toBe('streaming');
    drop(FakeSource.CLOSED);
    expect(status()).toBe('stalled');
    expect(screen.getByText('Tháng 9')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
