import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToSrgb255 } from '../apps/web/src/design/contrast.ts';
import { colorPairs } from '../apps/web/src/design/text-pairs.ts';
import { colors } from '../apps/web/src/design/tokens.ts';
import { checkPairs, checkSelection, findBannedTokenColors, type Palette } from './contrast-check.ts';

describe('OKLCH conversion against culori 4 formatRgb and wcagContrast', () => {
  it('converts light ink oklch(24% 0.02 60) to rgb(38, 29, 22)', () => {
    expect(oklchToSrgb255([24, 0.02, 60])).toEqual([38, 29, 22]);
  });

  it('measures light ink on paper at 15.81:1', () => {
    expect(contrastRatio(colors.ink.light, colors.paper.light)).toBeCloseTo(15.808, 2);
  });
});

describe('checkPairs', () => {
  it('passes ink text on paper', () => {
    const [light] = checkPairs(colors, [{ foreground: 'ink', background: 'paper', kind: 'text' }]);
    expect(light).toMatchObject({ theme: 'light', ok: true, minimum: 4.5 });
  });

  it("fails the brief's starting light due ochre as a shape on paper at 2.61:1", () => {
    const palette: Palette = { ...colors, due: { ...colors.due, light: [70, 0.13, 75] } };
    const [light] = checkPairs(palette, [{ foreground: 'due', background: 'paper', kind: 'shape' }]);
    expect(light?.ok).toBe(false);
    expect(light?.ratio).toBeCloseTo(2.609, 2);
  });

  it('passes every pair the UI draws, in both themes', () => {
    const failures = checkPairs(colors, colorPairs).filter((r) => !r.ok);
    expect(failures).toEqual([]);
  });
});

describe('findBannedTokenColors', () => {
  it('names a token that renders as pure white', () => {
    const palette: Palette = { ...colors, surface: { ...colors.surface, light: [100, 0, 0] } };
    expect(findBannedTokenColors(palette)).toEqual(['surface (light) renders as rgb(255, 255, 255)']);
  });

  it('names a token outside sRGB', () => {
    const palette: Palette = { ...colors, lacquer: { ...colors.lacquer, dark: [70, 0.3, 35] } };
    expect(findBannedTokenColors(palette)).toEqual(['lacquer (dark) is outside sRGB']);
  });

  it('accepts the shipped tokens', () => {
    expect(findBannedTokenColors(colors)).toEqual([]);
  });
});

describe('::selection', () => {
  it('checks the selection colors globals.css declares, in both themes', () => {
    const results = checkSelection(colors);
    expect(results.map((r) => r.theme)).toEqual(['light', 'dark']);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it('fails a selection ground too close to the ink', () => {
    const palette: Palette = { ...colors, lacquer: { ...colors.lacquer, light: [24, 0.02, 60] } };
    expect(checkSelection(palette, { mix: 'lacquer', percent: 90, into: 'paper', foreground: 'ink' })[0]?.ok).toBe(false);
  });
});
