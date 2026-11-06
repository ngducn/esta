import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('keeps a path of this app with its query', () => {
    expect(safeReturnPath('/assistant?note=0b0a1c2e-1111-4222-8333-444455556666')).toBe('/assistant?note=0b0a1c2e-1111-4222-8333-444455556666');
  });

  it.each([undefined, '', 'assistant', '//evil.example', 'https://evil.example/x', '/\\evil.example', '/a\nb', '/sign-in', '/sign-in/code?x=1', '/sign-up'])('refuses %j', (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });
});
