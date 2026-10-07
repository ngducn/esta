import type { Oklch } from './tokens';

export type Rgb = readonly [r: number, g: number, b: number];

const GAMUT_EPSILON = 1e-4;

function oklchToLinearSrgb([lightness, chroma, hue]: Oklch): Rgb {
  const l = lightness / 100;
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

export function inSrgbGamut(color: Oklch): boolean {
  return oklchToLinearSrgb(color).every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function oklchToSrgb255(color: Oklch): Rgb {
  const [r, g, b] = oklchToLinearSrgb(color);
  const to255 = (v: number) => Math.round(encode(clamp01(v)) * 255);
  return [to255(r), to255(g), to255(b)];
}

function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b);
}

export function contrastRatio(foreground: Oklch, background: Oklch): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
