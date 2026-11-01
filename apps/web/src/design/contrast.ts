import type { Hex } from './tokens';

export type Rgb = readonly [r: number, g: number, b: number];

export function hexToRgb(color: Hex): Rgb {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const channelHex = (channel: number) => Math.round(channel).toString(16).padStart(2, '0');

const linear = (channel: number) => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function relativeLuminance(color: Hex): number {
  const [r, g, b] = hexToRgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(foreground: Hex, background: Hex): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `a` at `share` opacity over `b`, as the browser composites a translucent fill (`bg-bg/85`) onto what lies under it. */
export function blendHex(a: Hex, b: Hex, share: number): Hex {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const mix = (over: number, under: number) => channelHex(over * share + under * (1 - share));
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}
