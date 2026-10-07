import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { contrastRatio, inSrgbGamut, mixOklch, oklchToSrgb255 } from '../apps/web/src/design/contrast.ts';
import { colorPairs, minimumRatio, type ColorPair } from '../apps/web/src/design/text-pairs.ts';
import { colors, type ColorToken, type Oklch, type Theme } from '../apps/web/src/design/tokens.ts';
import { findUnlistedPairs } from './used-color-pairs.ts';

export type Palette = Record<ColorToken, Record<Theme, Oklch>>;

export type PairResult = ColorPair & { theme: Theme; ratio: number; minimum: number; ok: boolean };

const themes: readonly Theme[] = ['light', 'dark'];

export function checkPairs(palette: Palette, pairs: readonly ColorPair[]): PairResult[] {
  return themes.flatMap((theme) =>
    pairs.map((pair) => {
      const ratio = contrastRatio(palette[pair.foreground][theme], palette[pair.background][theme]);
      const minimum = minimumRatio[pair.kind];
      return { ...pair, theme, ratio, minimum, ok: ratio >= minimum };
    }),
  );
}

export type Selection = { foreground: ColorToken; mix: ColorToken; percent: number; into: ColorToken };

const selectionRule =
  /::selection\s*\{\s*background-color:\s*color-mix\(in oklch, var\(--([\w-]+)\) (\d+)%, var\(--([\w-]+)\)\);\s*color:\s*var\(--([\w-]+)\);/;

export function readSelection(css = readFileSync(new URL('../apps/web/src/app/globals.css', import.meta.url), 'utf8')): Selection {
  const [, mix = '', percent = '', into = '', foreground = ''] = selectionRule.exec(css) ?? [];
  const token = (name: string): ColorToken => {
    if (name in colors) return name as ColorToken;
    throw new Error('globals.css ::selection must set color-mix(in oklch, var(--<token>) N%, var(--<token>)) and color: var(--<token>)');
  };
  return { mix: token(mix), percent: Number(percent), into: token(into), foreground: token(foreground) };
}

export function checkSelection(palette: Palette, selection: Selection = readSelection()) {
  return themes.map((theme) => {
    const ground = mixOklch(palette[selection.mix][theme], palette[selection.into][theme], selection.percent / 100);
    const ratio = contrastRatio(palette[selection.foreground][theme], ground);
    return { theme, ratio, minimum: minimumRatio.text, ok: ratio >= minimumRatio.text };
  });
}

export function findBannedTokenColors(palette: Palette): string[] {
  return Object.entries(palette).flatMap(([token, byTheme]) =>
    themes.flatMap((theme) => {
      const color = byTheme[theme];
      const rgb = oklchToSrgb255(color).join(', ');
      const problems: string[] = [];
      if (!inSrgbGamut(color)) problems.push(`${token} (${theme}) is outside sRGB`);
      if (rgb === '0, 0, 0' || rgb === '255, 255, 255') problems.push(`${token} (${theme}) renders as rgb(${rgb})`);
      return problems;
    }),
  );
}

function main(): void {
  const results = checkPairs(colors, colorPairs);
  const header = ['theme', 'foreground', 'background', 'kind', 'ratio', 'min', 'result'];
  const rows = results.map((r) => [
    r.theme,
    r.foreground,
    r.background,
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
  const failed = results.filter((r) => !r.ok).length;
  const selectionFailed = selection.some((r) => !r.ok);
  console.log(
    `contrast: ${results.length - failed}/${results.length} pairs pass, ${tokenProblems.length} token problems, ${unlisted.length} unlisted pairs`,
  );
  if (failed > 0 || selectionFailed || tokenProblems.length > 0 || unlisted.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
