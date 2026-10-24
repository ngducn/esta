import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import { densities, typeScale, typefaces } from '@/design/tokens';

const globalsPath = fileURLToPath(new URL('./globals.css', import.meta.url));
const require = createRequire(import.meta.url);

async function build(candidates: string[]): Promise<string> {
  const compiler = await compile(readFileSync(globalsPath, 'utf8'), {
    base: dirname(globalsPath),
    loadStylesheet: async (id, base) => {
      const path = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler.build(candidates);
}

const rulesFor = (css: string, className: string) => {
  const selector = `.${className.replace(':', '\\:')}`;
  return css
    .split(selector)
    .slice(1)
    .map((rest) => selector + rest.slice(0, rest.indexOf('}') + 1));
};

describe('globals.css', () => {
  it('ties dark: utilities to data-theme="dark", which the esta_theme cookie sets', async () => {
    const [chosen] = rulesFor(await build(['dark:bg-ink']), 'dark:bg-ink');
    expect(chosen).toMatch(/^\.dark\\:bg-ink:where\(\[data-theme="dark"\], \[data-theme="dark"\] \*\) \{/);
  });

  it('never follows the system dark setting, so light stays the default', async () => {
    const css = await build(['dark:bg-ink']);
    expect(css).not.toContain('prefers-color-scheme: dark');
  });

  it('lets compact density retune every spacing utility through one variable and leaves type alone', async () => {
    const css = await build(['p-4', 'gap-2', 'text-small', 'text-body']);
    expect(rulesFor(css, 'p-4').join('')).toContain('padding: calc(var(--spacing) * 4)');
    expect(rulesFor(css, 'gap-2').join('')).toContain('gap: calc(var(--spacing) * 2)');
    expect(css).toMatch(/:root\[data-density="compact"\] \{\s*--spacing: 0\.1875rem;/);
    expect(densities.compact.unitPx).toBeLessThan(densities.comfortable.unitPx);
    expect([...rulesFor(css, 'text-small'), ...rulesFor(css, 'text-body')].join('')).not.toContain('--spacing');
    expect(typeScale.small.px, 'the compact density floor').toBeGreaterThanOrEqual(15);
  });

  it('offers only the font weights the typefaces ship, none heavier than semibold', async () => {
    const shipped: readonly number[] = Object.values(typefaces).flatMap((face) => face.weights);
    const all = ['font-thin', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-black'];
    const css = await build(all);
    const offered = all.flatMap((name) => [...rulesFor(css, name).join('').matchAll(/(?<!-)font-weight:\s*(\d+)/g)].map((m) => [name, Number(m[1])]));
    expect(offered).toEqual([
      ['font-normal', 400],
      ['font-medium', 500],
      ['font-semibold', 600],
    ]);
    expect(offered.every(([, weight]) => shipped.includes(Number(weight)))).toBe(true);
    expect(Math.max(...shipped)).toBe(600);
  });
});
