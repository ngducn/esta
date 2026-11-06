import { describe, expect, it } from 'vitest';
import { classUses, unknownClasses } from './check-tailwind-classes.ts';

const names = (code: string) => classUses('x.tsx', code).map((use) => use.name);

describe('classUses', () => {
  it('reads className strings, cn arms and object keys, and skips the conditions', () => {
    const code = `const a = <p className={cn('flex p-2', tone === 'due' && 'bg-warning-bg', ok ? 'a-1' : 'b-2', { 'c-3': on })} />;`;
    expect(names(code)).toEqual(['flex', 'p-2', 'bg-warning-bg', 'a-1', 'b-2', 'c-3']);
  });

  it('skips group and peer markers and interpolated names', () => {
    expect(names('const a = <p className={`group/row peer p-${n} text-body`} />;')).toEqual(['text-body']);
  });
});

describe('unknownClasses', () => {
  it('finds no class in apps/web/src that neither tokens.css nor Tailwind defines', async () => {
    expect(await unknownClasses()).toEqual([]);
  });
});
