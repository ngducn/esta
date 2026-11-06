import { isCalcRef as coreIsCalcRef, isSourceRef as coreIsSourceRef } from '@esta/core/assistant';
import { describe, expect, it } from 'vitest';
import { isAnswerEvent, isAnswerState, isCalcRef, isSourceRef } from './answer-state';

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

describe('the guards mirrored from core (L7)', () => {
  const samples: unknown[] = [
    { kind: 'calc', working: '1.500.000 ₫ × 12 = 18.000.000 ₫' },
    { kind: 'calc', working: 3 },
    { kind: 'calc' },
    { kind: 'source', n: 1, url: 'https://demo.example/a', source_name: 'demo.example', published_on: null },
    { kind: 'source', n: '1', url: 'https://demo.example/a', source_name: 'demo.example' },
    { kind: 'source', url: 'https://demo.example/a' },
    { kind: 'other', working: 'x' },
    'esta://property/1',
    null,
    undefined,
    42,
    [],
  ];

  it('answer the same as core for every ref shape, so a ref core stores is never refused on the way back', () => {
    for (const sample of samples) {
      expect(isCalcRef(sample), JSON.stringify(sample)).toBe(coreIsCalcRef(sample));
      expect(isSourceRef(sample), JSON.stringify(sample)).toBe(coreIsSourceRef(sample));
    }
  });
});
