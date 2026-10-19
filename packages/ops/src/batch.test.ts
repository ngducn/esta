import { reduceNationalIds } from '@esta/core/agent-schemas';
import { describe, expect, it } from 'vitest';
import { reduceTypedIds } from './batch';

describe('reduceTypedIds', () => {
  const digitTail = '5a7ba01a-8719-4c6b-a777-000000000123';
  const typed = { id: digitTail, property_id: digitTail, refs: [digitTail], set: { notes: 'Demo: chủ cũ CCCD 001234567890, gọi trước' } };

  it('reads a uuid whose last group is all digits as an ID number when left to the reducer alone', () => {
    expect(reduceNationalIds(typed)).toMatchObject({ id: '0123', property_id: '0123', refs: ['5a7ba01a-8719-4c6b-a777-0123'] });
  });

  it('keeps every such uuid whole under any key and cuts an ID number Ryan typed to its last four', () => {
    expect(reduceTypedIds(typed)).toEqual({ ...typed, set: { notes: 'Demo: chủ cũ CCCD 7890, gọi trước' } });
  });

  it('keeps a file path whole, so the file it names is the one read, and still cuts the title', () => {
    const attach = { path: 'Demo/hop-dong-demo-079123456789.pdf', title: 'Hợp đồng Demo CCCD 001234567890' };
    expect(reduceTypedIds(attach)).toEqual({ path: attach.path, title: 'Hợp đồng Demo CCCD 7890' });
  });
});
