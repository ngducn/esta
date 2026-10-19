import { describe, expect, it } from 'vitest';
import { reduceTypedIds } from './batch';

describe('reduceTypedIds', () => {
  it('keeps only the last four digits of an ID number Ryan typed, and every id whole', () => {
    const digitTail = '5a7ba01a-8719-556b-a777-918212345678';
    const reduced = reduceTypedIds({ id: digitTail, set: { notes: 'Chủ cũ CCCD 001234567890, gọi trước khi đến' }, refs: [digitTail] });
    expect(reduced).toMatchObject({ id: digitTail, refs: [digitTail] });
    expect(JSON.stringify(reduced)).not.toContain('001234567890');
    expect(JSON.stringify(reduced)).toContain('7890');
  });
});
