import { describe, expect, it } from 'vitest';
import { blendHex, contrastRatio } from '../apps/web/src/design/contrast.ts';
import { colorPairs } from '../apps/web/src/design/text-pairs.ts';
import { colors } from '../apps/web/src/design/tokens.ts';
import { checkPairs, checkSelection, findBannedTokenColors, type Palette } from './contrast-check.ts';

describe('contrastRatio against the contrast table in docs/design/redesign-2026-11/01-foundations.md', () => {
  it('reads text on bg as 16.42 in light and 17.47 in dark', () => {
    expect(contrastRatio(colors.text.light, colors.bg.light)).toBeCloseTo(16.42, 2);
    expect(contrastRatio(colors.text.dark, colors.bg.dark)).toBeCloseTo(17.47, 2);
  });

  it('reads the primary button label on accent as 5.91 in both themes', () => {
    expect(contrastRatio(colors['on-accent'].light, colors.accent.light)).toBeCloseTo(5.91, 2);
    expect(contrastRatio(colors['on-accent'].dark, colors.accent.dark)).toBeCloseTo(5.91, 2);
  });
});

describe('checkPairs', () => {
  it('holds body text to 7:1 and other text to 4.5:1', () => {
    const [body] = checkPairs(colors, [{ foreground: 'text', background: 'bg', kind: 'body' }]);
    const [muted] = checkPairs(colors, [{ foreground: 'text-muted', background: 'bg', kind: 'text' }]);
    expect(body).toMatchObject({ theme: 'light', ok: true, minimum: 7 });
    expect(muted).toMatchObject({ theme: 'light', ok: true, minimum: 4.5 });
  });

  it('fails text-muted set as body text, below AAA', () => {
    const [light] = checkPairs(colors, [{ foreground: 'text-muted', background: 'bg', kind: 'body' }]);
    expect(light?.ok).toBe(false);
  });

  it('fails a decorative border used as a field edge', () => {
    const palette: Palette = { ...colors, 'border-field': { ...colors['border-field'], light: colors['border-strong'].light } };
    const [light] = checkPairs(palette, [{ foreground: 'border-field', background: 'bg', kind: 'shape' }]);
    expect(light).toMatchObject({ ok: false, minimum: 3 });
  });

  it('blends a translucent background into each ground and reports the lowest ratio', () => {
    const solid = checkPairs(colors, [{ foreground: 'on-accent', background: 'accent', kind: 'text' }])[0];
    const thinned = checkPairs(colors, [{ foreground: 'on-accent', background: 'accent', kind: 'text', opacity: 60 }])[0];
    expect(thinned?.ratio).toBeLessThan(solid?.ratio ?? 0);
    expect(thinned?.ok).toBe(false);
  });

  it('passes every pair the UI draws, in both themes', () => {
    expect(checkPairs(colors, colorPairs).filter((r) => !r.ok)).toEqual([]);
  });
});

describe('blendHex', () => {
  it('composites in sRGB, as the browser does', () => {
    expect(blendHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(blendHex('#1b5bda', '#1b5bda', 0.3)).toBe('#1b5bda');
  });
});

describe('findBannedTokenColors', () => {
  it('names a token that renders as pure black', () => {
    const palette: Palette = { ...colors, text: { ...colors.text, light: '#000000' } };
    expect(findBannedTokenColors(palette)).toEqual(['text (light) is pure black']);
  });

  it('names a token written in another form', () => {
    const palette: Palette = { ...colors, accent: { ...colors.accent, dark: '#1B5BDA' } };
    expect(findBannedTokenColors(palette)).toEqual(['accent (dark) is not a lowercase #rrggbb hex']);
  });

  it('accepts the shipped tokens, white cards included', () => {
    expect(colors.surface.light).toBe('#ffffff');
    expect(findBannedTokenColors(colors)).toEqual([]);
  });
});

describe('::selection', () => {
  it('checks the selection colors globals.css declares, in both themes', () => {
    const results = checkSelection(colors);
    expect(results.map((r) => r.theme)).toEqual(['light', 'dark']);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });

  it('fails a selection ground too close to the text', () => {
    expect(checkSelection(colors, { background: 'text-secondary', foreground: 'text' })[0]?.ok).toBe(false);
  });
});
