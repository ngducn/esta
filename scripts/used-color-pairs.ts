import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorPairs, grounds, type ColorPair } from '../apps/web/src/design/text-pairs.ts';
import { colors, type ColorToken } from '../apps/web/src/design/tokens.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const webSrc = join(repo, 'apps/web/src');

const tokenNames = Object.keys(colors).sort((a, b) => b.length - a.length);
const colorUtility = new RegExp(`^(text|bg)-(${tokenNames.join('|')})(?:/\\d+)?$`);
const stringLiteral = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;

const isToken = (name: string): name is ColorToken => name in colors;

type Layer = { text?: ColorToken; bg?: ColorToken };

/**
 * Reads every class list in the source and returns the color pairs it draws. Each variant
 * (`hover:`, `group-data-checked/box:`) pairs its text with its own background, falling back
 * to the base class, then to the grounds. Disabled variants are skipped: WCAG 1.4.3 exempts
 * inactive controls. A pair split across parent and child elements is out of reach.
 */
export function usedColorPairs(source: string): ColorPair[] {
  return [...source.matchAll(stringLiteral)].flatMap((match) => {
    const layers = new Map<string, Layer>();
    for (const className of (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/)) {
      const cut = className.lastIndexOf(':') + 1;
      const variant = className.slice(0, cut);
      const utility = colorUtility.exec(className.slice(cut));
      if (utility === null || variant.includes('disabled')) continue;
      const [, kind, token = ''] = utility;
      if (!isToken(token)) continue;
      const layer = layers.get(variant) ?? {};
      layers.set(variant, kind === 'text' ? { ...layer, text: token } : { ...layer, bg: token });
    }
    const base = layers.get('');
    return [...layers.values()].flatMap((layer) => {
      const foreground = layer.text ?? base?.text;
      if (foreground === undefined) return [];
      const background = layer.bg ?? base?.bg;
      return (background === undefined ? grounds : [background]).map((ground): ColorPair => ({ kind: 'text', foreground, background: ground }));
    });
  });
}

function webSources(dir = webSrc): { path: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return webSources(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [{ path: relative(repo, path), source: readFileSync(path, 'utf8') }];
  });
}

const keyOf = (pair: ColorPair) => `${pair.foreground} ${pair.kind} on ${pair.background}`;

/** Names each pair the web app draws that `text-pairs.ts` leaves out of the contrast check. */
export function findUnlistedPairs(files = webSources()): string[] {
  const listed = new Set(colorPairs.map(keyOf));
  return files.flatMap(({ path, source }) => [
    ...new Set(usedColorPairs(source).map(keyOf).filter((key) => !listed.has(key)).map((key) => `${path}: ${key}`)),
  ]);
}
