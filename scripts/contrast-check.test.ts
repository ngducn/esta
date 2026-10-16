import { describe, expect, it } from 'vitest';
import { oklchToSrgb255 } from '../apps/web/src/design/contrast.ts';
import { colorPairs } from '../apps/web/src/design/text-pairs.ts';
import { colors } from '../apps/web/src/design/tokens.ts';
import { checkPairs, checkSelection, findBannedTokenColors, type Palette } from './contrast-check.ts';

describe('OKLCH conversion against culori 4 formatRgb and wcagContrast', () => {
  it('converts light ink oklch(20.9% 0.01 268) back to the mock hex #16181D', () => {
    expect(oklchToSrgb255(colors.ink.light)).toEqual([22, 24, 29]);
  });

  it('converts the accent oklch(53% 0.166 32) back to the mock hex #B83A26', () => {
    expect(oklchToSrgb255(colors.accent.light)).toEqual([184, 58, 37]);
  });
});

describe('checkPairs', () => {
  it('passes ink text on the ground', () => {
    const [light] = checkPairs(colors, [{ foreground: 'ink', background: 'ground', kind: 'text' }]);
    expect(light).toMatchObject({ theme: 'light', ok: true, minimum: 4.5 });
  });

  it("fails the mock's light rule-strong as a field border on the ground", () => {
    const palette: Palette = { ...colors, field: { ...colors.field, light: colors['rule-strong'].light } };
    const [light] = checkPairs(palette, [{ foreground: 'field', background: 'ground', kind: 'shape' }]);
    expect(light?.ok).toBe(false);
    expect(light?.minimum).toBe(3);
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
    const palette: Palette = { ...colors, accent: { ...colors.accent, dark: [70, 0.3, 35] } };
    expect(findBannedTokenColors(palette)).toEqual(['accent (dark) is outside sRGB']);
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
    const palette: Palette = { ...colors, accent: { ...colors.accent, light: [24, 0.02, 60] } };
    expect(checkSelection(palette, { mix: 'accent', percent: 90, into: 'surface', foreground: 'ink' })[0]?.ok).toBe(false);
  });
});
