import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
  const made: string[] = [];
  afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  const tree = (code: string, css = '') => {
    const src = mkdtempSync(join(tmpdir(), 'classes-'));
    made.push(src);
    mkdirSync(join(src, 'app'));
    writeFileSync(join(src, 'app/globals.css'), `@import 'tailwindcss';\n${css}`);
    writeFileSync(join(src, 'page.tsx'), code);
    return src;
  };

  it('names a class that neither Tailwind nor the stylesheet defines, and passes the ones they do', async () => {
    const src = tree(`const a = <p className="flex p-2 made-up-class by-hand" />;`, '.by-hand { color: red; }');
    expect((await unknownClasses(src)).map((use) => use.name)).toEqual(['made-up-class']);
  });
});
