import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorPairs, grounds, type ColorPair } from '../apps/web/src/design/text-pairs.ts';
import { colors, type ColorToken } from '../apps/web/src/design/tokens.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const webSrc = join(repo, 'apps/web/src');

const tokenNames = Object.keys(colors).sort((a, b) => b.length - a.length);
const colorUtility = new RegExp(`^(text|bg)-(${tokenNames.join('|')})(?:/(\\d+))?$`);
const stringLiteral = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;

const isToken = (name: string): name is ColorToken => name in colors;

type Layer = { text?: ColorToken; bg?: ColorToken; bgOpacity?: number | undefined };

/**
 * Reads every class list in the source and returns the color pairs it draws. Each variant
 * (`hover:`, `group-data-checked/box:`) pairs its text with its own background, falling back
 * to the base class, then to the grounds. Disabled variants are skipped: WCAG 1.4.3 exempts
 * inactive controls. So are `backdrop:` variants:
 * a backdrop carries no text. A pair split across parent and child elements is out of reach.
 */
export function usedColorPairs(source: string): ColorPair[] {
  return [...source.matchAll(stringLiteral)].flatMap((match) => {
    const layers = new Map<string, Layer>();
    for (const className of (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/)) {
      const cut = className.lastIndexOf(':') + 1;
      const variant = className.slice(0, cut);
      const utility = colorUtility.exec(className.slice(cut));
      if (utility === null || variant.includes('disabled') || variant.includes('backdrop')) continue;
      const [, kind, token = '', opacity] = utility;
      if (!isToken(token)) continue;
      const layer = layers.get(variant) ?? {};
      layers.set(
        variant,
        kind === 'text' ? { ...layer, text: token } : { ...layer, bg: token, bgOpacity: opacity === undefined ? undefined : Number(opacity) },
      );
    }
    const base = layers.get('');
    return [...layers.values()].flatMap((layer) => {
      const foreground = layer.text ?? base?.text;
      if (foreground === undefined) return [];
      const own = layer.bg === undefined ? base : layer;
      const background = own?.bg;
      if (background === undefined) return grounds.map((ground): ColorPair => ({ kind: 'text', foreground, background: ground }));
      const pair: ColorPair = { kind: 'text', foreground, background };
      return [own?.bgOpacity === undefined ? pair : { ...pair, opacity: own.bgOpacity }];
    });
  });
}

function webSources(extensions = /\.tsx?$/, dir = webSrc): { path: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return webSources(extensions, path);
    if (!extensions.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [{ path: relative(repo, path), source: readFileSync(path, 'utf8') }];
  });
}

/** The listed kind sets the minimum, which the source cannot tell, so a drawn pair matches a listed one of any kind. */
const keyOf = (pair: ColorPair) => `${pair.foreground} on ${pair.background}${pair.opacity === undefined ? '' : `/${pair.opacity}`}`;

/** Names each pair the web app draws that `text-pairs.ts` leaves out of the contrast check. */
export function findUnlistedPairs(files = webSources()): string[] {
  const listed = new Set(colorPairs.map(keyOf));
  return files.flatMap(({ path, source }) => [
    ...new Set(usedColorPairs(source).map(keyOf).filter((key) => !listed.has(key)).map((key) => `${path}: ${key}`)),
  ]);
}

const RETIRED_COLORS = ['ground', 'surface-2', 'ink', 'ink-2', 'ink-muted', 'rule', 'rule-strong', 'field', 'accent-tint', 'paid', 'due', 'overdue', 'vacant'];
const COLOR_UTILITIES = 'bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|divide|decoration|fill|stroke|accent|caret|placeholder|from|via|to';
const retiredClass = new RegExp(
  `^(?:\\S*:)?!?(?:(?:${COLOR_UTILITIES})-(?:${RETIRED_COLORS.join('|')})(?:-fill)?(?:/\\d+)?|text-(?:accent|surface|meta|small|lead|h[123]|hero|hero-xl)|(?:outline|ring)-(?:accent|focus)|figures|shadow-(?:card|sheet)|max-w-content)$`,
);
const retiredVar = new RegExp(`var\\(--(?:${RETIRED_COLORS.join('|')})(?:-fill)?\\)|--(?:${RETIRED_COLORS.join('|')})(?:-fill)?(?=\\s*:)`, 'g');

/**
 * Names each class or variable still in the 2026-10 vocabulary that the 2026-11 redesign retired. Tailwind drops an
 * unknown class without a word, so a stray `text-ink` would draw in the inherited colour and no check would notice.
 */
export function findRetiredNames(
  files = webSources(/\.(?:tsx?|css)$/).filter(({ path }) => !path.startsWith('apps/web/src/design/')),
): string[] {
  return files.flatMap(({ path, source }) => {
    const classes = [...source.matchAll(stringLiteral)].flatMap((match) =>
      (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/).filter((className) => retiredClass.test(className)),
    );
    const vars = [...source.matchAll(retiredVar)].map((match) => match[0]);
    return [...new Set([...classes, ...vars])].map((name) => `${path}: ${name}`);
  });
}
