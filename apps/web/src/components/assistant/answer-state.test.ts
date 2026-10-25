import { describe, expect, it } from 'vitest';
import { isAnswerEvent, isAnswerState } from './answer-state';

const running = { content: 'Dãy trọ Dĩ An đã thu', status: 'streaming', refs: ['esta://property/1'] };

describe('isAnswerEvent', () => {
  it('takes an answer so far and the two events that stop the stream', () => {
    expect(isAnswerEvent(running)).toBe(true);
    expect(isAnswerEvent({ ...running, status: 'done', refs: [] })).toBe(true);
    expect(isAnswerEvent({ status: 'timeout' })).toBe(true);
    expect(isAnswerEvent({ status: 'gone' })).toBe(true);
  });

  it('refuses an unknown status, links that are not text, missing text and a stop event that carries text', () => {
    expect(isAnswerEvent({ ...running, status: 'stalled' })).toBe(false);
    expect(isAnswerEvent({ ...running, refs: [42] })).toBe(false);
    expect(isAnswerEvent({ ...running, refs: 'esta://property/1' })).toBe(false);
    expect(isAnswerEvent({ status: 'done', refs: [] })).toBe(false);
    expect(isAnswerEvent({ content: 'cũ', status: 'timeout' })).toBe(false);
    expect(isAnswerEvent(null)).toBe(false);
    expect(isAnswerEvent('done')).toBe(false);
  });
});

describe('isAnswerState', () => {
  it('refuses a stop event, which has no text to show', () => {
    expect(isAnswerState({ status: 'gone' })).toBe(false);
    expect(isAnswerState(running)).toBe(true);
  });
});
