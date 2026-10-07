import { pathToFileURL } from 'node:url';
import { contrastRatio, inSrgbGamut, oklchToSrgb255 } from '../apps/web/src/design/contrast.ts';
import { colorPairs, minimumRatio, type ColorPair } from '../apps/web/src/design/text-pairs.ts';
import { colors, type ColorToken, type Oklch, type Theme } from '../apps/web/src/design/tokens.ts';

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

  const tokenProblems = findBannedTokenColors(colors);
  for (const problem of tokenProblems) console.log(`FAIL ${problem}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`contrast: ${results.length - failed}/${results.length} pairs pass, ${tokenProblems.length} token problems`);
  if (failed > 0 || tokenProblems.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
