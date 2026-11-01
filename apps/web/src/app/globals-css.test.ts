import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import { densities, typeStyles, typefaces } from '@/design/tokens';

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
    const [chosen] = rulesFor(await build(['dark:bg-surface']), 'dark:bg-surface');
    expect(chosen).toMatch(/^\.dark\\:bg-surface:where\(\[data-theme="dark"\], \[data-theme="dark"\] \*\) \{/);
  });

  it('never follows the system dark setting, so light stays the default', async () => {
    const css = await build(['dark:bg-surface']);
    expect(css).not.toContain('prefers-color-scheme: dark');
  });

  it('lets Gọn retune the component variables and leaves type and the spacing unit alone', async () => {
    const css = await build(['min-h-control-h', 'p-card-pad', 'gap-stack', 'p-4', 'text-body-sm', 'text-body']);
    expect(rulesFor(css, 'min-h-control-h').join('')).toContain('min-height: var(--control-h)');
    expect(rulesFor(css, 'p-card-pad').join('')).toContain('padding: var(--card-pad)');
    expect(css).toMatch(/:root\[data-density="compact"\] \{\s*--control-h: 2\.5rem;/);
    expect(css).not.toMatch(/data-density="compact"\] \{[^}]*--spacing/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*:root\[data-density="compact"\] \{\s*--control-h: 2\.75rem;/);
    expect(densities.compact['control-h']).toBeLessThan(densities.comfortable['control-h']);
    expect([...rulesFor(css, 'text-body-sm'), ...rulesFor(css, 'text-body')].join('')).not.toMatch(/--(control-h|card-pad|stack|spacing)/);
    expect(typeStyles['body-sm'].px, 'the smallest reading size').toBeGreaterThanOrEqual(15);
  });

  it('keeps a 400 type style from setting a weight, so a semibold heading keeps its weight', async () => {
    const css = await build(['text-body', 'text-headline']);
    expect(rulesFor(css, 'text-body').join('')).not.toContain('font-weight');
    expect(rulesFor(css, 'text-headline').join('')).toContain('font-weight: var(--tw-font-weight, 600)');
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

  it('sets bold Markdown and <b> to semibold, not the bolder (700) preflight gives them', async () => {
    const css = await build([]);
    const weights = [...css.matchAll(/(?:^|[},])\s*((?:[a-z0-9]+,\s*)*(?:b|strong)(?:,\s*[a-z0-9]+)*)\s*\{([^}]*)\}/g)]
      .filter(([, selectors]) => selectors?.split(/,\s*/).includes('strong'))
      .flatMap(([, , body]) => [...(body ?? '').matchAll(/font-weight:\s*([^;]+);/g)].map((m) => m[1]?.trim()));
    expect(weights.at(-1)).toBe('600');
  });
});
