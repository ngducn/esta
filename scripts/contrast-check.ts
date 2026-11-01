import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { blendHex, contrastRatio } from '../apps/web/src/design/contrast.ts';
import { colorPairs, grounds, minimumRatio, type ColorPair } from '../apps/web/src/design/text-pairs.ts';
import { colors, type ColorToken, type Hex, type Theme } from '../apps/web/src/design/tokens.ts';
import { findRetiredNames, findUnlistedPairs } from './used-color-pairs.ts';

export type Palette = Record<ColorToken, Record<Theme, Hex>>;

export type PairResult = ColorPair & { theme: Theme; ratio: number; minimum: number; ok: boolean };

const themes: readonly Theme[] = ['light', 'dark'];

/** A translucent background shows the ground through it, so the pair holds only if it holds on every ground. */
function pairRatio(palette: Palette, pair: ColorPair, theme: Theme): number {
  const foreground = palette[pair.foreground][theme];
  if (pair.opacity === undefined) return contrastRatio(foreground, palette[pair.background][theme]);
  const share = pair.opacity / 100;
  return Math.min(...grounds.map((ground) => contrastRatio(foreground, blendHex(palette[pair.background][theme], palette[ground][theme], share))));
}

export function checkPairs(palette: Palette, pairs: readonly ColorPair[]): PairResult[] {
  return themes.flatMap((theme) =>
    pairs.map((pair) => {
      const ratio = pairRatio(palette, pair, theme);
      const minimum = minimumRatio[pair.kind];
      return { ...pair, theme, ratio, minimum, ok: ratio >= minimum };
    }),
  );
}

export type Selection = { foreground: ColorToken; background: ColorToken };

const selectionRule = /::selection\s*\{\s*background-color:\s*var\(--([\w-]+)\);\s*color:\s*var\(--([\w-]+)\);/;

export function readSelection(css = readFileSync(new URL('../apps/web/src/app/globals.css', import.meta.url), 'utf8')): Selection {
  const [, background = '', foreground = ''] = selectionRule.exec(css) ?? [];
  const token = (name: string): ColorToken => {
    if (name in colors) return name as ColorToken;
    throw new Error('globals.css ::selection must set background-color: var(--<token>) and color: var(--<token>)');
  };
  return { background: token(background), foreground: token(foreground) };
}

export function checkSelection(palette: Palette, selection: Selection = readSelection()) {
  return themes.map((theme) => {
    const ratio = contrastRatio(palette[selection.foreground][theme], palette[selection.background][theme]);
    return { theme, ratio, ok: ratio >= minimumRatio.text };
  });
}

/** Never pure black (01-foundations); white is allowed, for cards and inputs. */
export function findBannedTokenColors(palette: Palette): string[] {
  return Object.entries(palette).flatMap(([token, byTheme]) =>
    themes.flatMap((theme) => {
      const color = byTheme[theme];
      if (!/^#[0-9a-f]{6}$/.test(color)) return [`${token} (${theme}) is not a lowercase #rrggbb hex`];
      return color === '#000000' ? [`${token} (${theme}) is pure black`] : [];
    }),
  );
}

function main(): void {
  const results = checkPairs(colors, colorPairs);
  const header = ['theme', 'foreground', 'background', 'kind', 'ratio', 'min', 'result'];
  const rows = results.map((r) => [
    r.theme,
    r.foreground,
    r.opacity === undefined ? r.background : `${r.background}/${r.opacity}`,
    r.kind,
    r.ratio.toFixed(2),
    r.minimum.toFixed(1),
    r.ok ? 'PASS' : 'FAIL',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  console.log(line(header));
  for (const row of rows) console.log(line(row));

  const selection = checkSelection(colors);
  for (const r of selection) console.log(`${r.ok ? 'PASS' : 'FAIL'} ::selection (${r.theme}) ${r.ratio.toFixed(2)}`);
  const tokenProblems = findBannedTokenColors(colors);
  for (const problem of tokenProblems) console.log(`FAIL ${problem}`);
  const unlisted = findUnlistedPairs();
  for (const pair of unlisted) console.log(`FAIL ${pair} is drawn but not listed in text-pairs.ts`);
  const retired = findRetiredNames();
  for (const name of retired) console.log(`FAIL ${name} is a retired 2026-10 name; rerun the RD-1 codemod or use the role token`);
  const failed = results.filter((r) => !r.ok).length;
  const selectionFailed = selection.some((r) => !r.ok);
  console.log(
    `contrast: ${results.length - failed}/${results.length} pairs pass, ${tokenProblems.length} token problems, ${unlisted.length} unlisted pairs, ${retired.length} retired names`,
  );
  if (failed > 0 || selectionFailed || tokenProblems.length > 0 || unlisted.length > 0 || retired.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
