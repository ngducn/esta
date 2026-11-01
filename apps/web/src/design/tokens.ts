export type Theme = 'light' | 'dark';

export type Hex = `#${string}`;

/**
 * The role colors of Ryan's 2026-11 design system, with the exact values of
 * docs/design/redesign-2026-11/tokens.json. The ramps stay out, except the few steps a component draws directly.
 */
export const colors = {
  bg: { light: '#f5f7f9', dark: '#0f1217' },
  'bg-subtle': { light: '#fafafc', dark: '#1d2128' },
  surface: { light: '#ffffff', dark: '#15191f' },
  'surface-raised': { light: '#ffffff', dark: '#1d2128' },
  'surface-inverse': { light: '#15191f', dark: '#eceff3' },
  'fill-hover': { light: '#eceff3', dark: '#1d2128' },
  'fill-pressed': { light: '#e3e6eb', dark: '#252a32' },
  'fill-hover-raised': { light: '#eceff3', dark: '#252a32' },
  'fill-pressed-raised': { light: '#e3e6eb', dark: '#30353e' },
  'fill-disabled': { light: '#eceff3', dark: '#1d2128' },
  skeleton: { light: '#eceff3', dark: '#30353e' },
  'segment-track': { light: '#eceff3', dark: '#1d2128' },
  'segment-selected': { light: '#ffffff', dark: '#30353e' },
  text: { light: '#15191f', dark: '#f5f7f9' },
  'text-secondary': { light: '#454c57', dark: '#b9bfc8' },
  'text-muted': { light: '#5e6570', dark: '#9299a4' },
  'text-disabled': { light: '#9299a4', dark: '#5e6570' },
  'text-inverse': { light: '#fafafc', dark: '#15191f' },
  border: { light: '#e3e6eb', dark: '#252a32' },
  'border-strong': { light: '#d5d9e0', dark: '#30353e' },
  'border-field': { light: '#757c88', dark: '#757c88' },
  accent: { light: '#1b5bda', dark: '#1b5bda' },
  'accent-hover': { light: '#144bb7', dark: '#144bb7' },
  'accent-pressed': { light: '#103c92', dark: '#103c92' },
  'on-accent': { light: '#ffffff', dark: '#ffffff' },
  'accent-text': { light: '#144bb7', dark: '#9bbefe' },
  'accent-subtle': { light: '#f1f6fe', dark: '#0b1e44' },
  'accent-subtle-hover': { light: '#dfebff', dark: '#0f2d68' },
  'accent-border': { light: '#c4d9fe', dark: '#103c92' },
  'focus-ring': { light: '#1b5bda', dark: '#689cfe' },
  'text-inverse-accent': { light: '#9bbefe', dark: '#144bb7' },
  'success-text': { light: '#1b6c3a', dark: '#85d99d' },
  'success-bg': { light: '#ebfbee', dark: '#0f2a18' },
  'success-border': { light: '#b3ebc0', dark: '#17552e' },
  'success-solid': { light: '#238549', dark: '#238549' },
  'on-success': { light: '#ffffff', dark: '#ffffff' },
  'warning-text': { light: '#975215', dark: '#fdc061' },
  'warning-bg': { light: '#fff6e4', dark: '#3a1f0c' },
  'warning-border': { light: '#ffda9c', dark: '#773f14' },
  'warning-solid': { light: '#f2a330', dark: '#f2a330' },
  'on-warning': { light: '#3a1f0c', dark: '#3a1f0c' },
  'danger-text': { light: '#a82522', dark: '#fda79d' },
  'danger-bg': { light: '#fff2f0', dark: '#411310' },
  'danger-border': { light: '#ffcbc4', dark: '#861e1b' },
  'danger-solid': { light: '#c82f2c', dark: '#c82f2c' },
  'on-danger': { light: '#ffffff', dark: '#ffffff' },
  'info-text': { light: '#144bb7', dark: '#9bbefe' },
  'info-bg': { light: '#f1f6fe', dark: '#0b1e44' },
  'info-border': { light: '#c4d9fe', dark: '#103c92' },
  'info-solid': { light: '#1b5bda', dark: '#1b5bda' },
  'on-info': { light: '#ffffff', dark: '#ffffff' },
  'neutral-text': { light: '#454c57', dark: '#b9bfc8' },
  'neutral-bg': { light: '#eceff3', dark: '#252a32' },
  'neutral-border': { light: '#d5d9e0', dark: '#30353e' },
  'neutral-solid': { light: '#454c57', dark: '#9299a4' },
  'on-neutral': { light: '#ffffff', dark: '#0a0d11' },
  // A QR code stays dark on light in both themes, because many bank apps cannot read an inverted code.
  'qr-paper': { light: '#ffffff', dark: '#ffffff' },
  'qr-ink': { light: '#15191f', dark: '#15191f' },
  // The toast icons on the inverse surface: bundle.css takes the other theme's ramp step (green-300 in light, green-700 in dark).
  'inverse-success': { light: '#85d99d', dark: '#1b6c3a' },
  'inverse-danger': { light: '#fda79d', dark: '#a82522' },
  // Ramp steps bundle.css draws directly for the danger button's hover and press.
  'red-700': { light: '#a82522', dark: '#a82522' },
  'red-800': { light: '#861e1b', dark: '#861e1b' },
} as const satisfies Record<string, Record<Theme, Hex>>;

export type ColorToken = keyof typeof colors;

/** Translucent layers carry no text of their own, so the contrast check leaves them out. */
export const overlays = {
  scrim: { light: 'rgba(15, 23, 42, 0.44)', dark: 'rgba(0, 0, 0, 0.6)' },
} as const satisfies Record<string, Record<Theme, string>>;

export const tones = ['success', 'warning', 'danger', 'info', 'neutral'] as const;

export type Tone = (typeof tones)[number];

/** Vietnamese stacked marks (ặ, ữ, Ướ) collide with the line above below this. */
export const minimumLeading = 1.3;

/** Unitless line heights for text outside a type style, such as a wrapped tab label or the glyph specimens. */
export const leading = { tight: 1.3, snug: 1.35 } as const;

export type TypeStyle = { px: number; linePx: number; weight: 400 | 500 | 600; trackingEm?: number };

/** The app type styles by name; `pnpm check` rejects a line height under `minimumLeading`. */
export const typeStyles = {
  display: { px: 40, linePx: 52, weight: 600, trackingEm: -0.022 },
  'title-1': { px: 30, linePx: 40, weight: 600, trackingEm: -0.02 },
  'title-2': { px: 24, linePx: 32, weight: 600, trackingEm: -0.016 },
  'title-3': { px: 20, linePx: 28, weight: 600, trackingEm: -0.01 },
  headline: { px: 18, linePx: 26, weight: 600, trackingEm: -0.006 },
  body: { px: 16, linePx: 24, weight: 400 },
  'body-strong': { px: 16, linePx: 24, weight: 500 },
  label: { px: 15, linePx: 20, weight: 500 },
  'body-sm': { px: 15, linePx: 22, weight: 400 },
  caption: { px: 14, linePx: 20, weight: 400, trackingEm: 0.004 },
  'figure-xl': { px: 40, linePx: 52, weight: 600, trackingEm: -0.022 },
  'figure-lg': { px: 32, linePx: 42, weight: 600, trackingEm: -0.02 },
  'figure-md': { px: 24, linePx: 32, weight: 600, trackingEm: -0.012 },
  amount: { px: 16, linePx: 24, weight: 500 },
} as const satisfies Record<string, TypeStyle>;

/** The weights the variable font ships; Tailwind offers no other `font-*` weight. Nothing is heavier than semibold (Ryan, 2026-10-24). */
export const fontWeight = { normal: 400, medium: 500, semibold: 600 } as const;

export const spacing = { unitPx: 4, touchPx: 44 } as const;

/**
 * Thoáng and Gọn set the component variables, never the type. Keys are the values a member's setting stores.
 * Gọn's control height clamps back to the touch minimum on a touch screen, and Thoáng pads cards less on a phone.
 */
export const densities = {
  comfortable: { 'control-h': 48, 'row-h': 64, 'list-row-h': 72, 'card-pad': 24, 'cell-x': 16, stack: 24, 'field-gap': 20 },
  compact: { 'control-h': 40, 'row-h': 44, 'list-row-h': 56, 'card-pad': 16, 'cell-x': 12, stack: 16, 'field-gap': 12 },
} as const satisfies Record<string, Record<string, number>>;

export const phoneCardPx = 16;

export type Density = keyof typeof densities;

export const densityNames = Object.keys(densities) as Density[];

export const isDensity = (value: unknown): value is Density => densityNames.some((name) => name === value);

export const textScales = [100, 115, 130] as const;

export type TextScale = (typeof textScales)[number];

export const breakpoints = { sm: 600, md: 840, lg: 1080, xl: 1440 } as const;

export const layout = {
  sidebar: 256,
  rail: 72,
  'bottom-nav': 64,
  form: 640,
  reading: 720,
  list: 1120,
  dashboard: 1280,
  menu: 320,
  'menu-wide': 360,
  toast: 416,
  dialog: 480,
} as const;

export const sizes = { 'control-sm': 36, 'control-lg': 56, 'icon-xs': 14, 'icon-sm': 16, 'icon-md': 20, 'icon-lg': 24 } as const;

export const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, '2xl': 24, full: 9999 } as const;

/** Hairline first, shadow second; dark keeps its shadows though they barely read. */
export const shadows = {
  xs: { light: '0 1px 2px rgba(16, 24, 40, 0.05)', dark: '0 1px 2px rgba(0, 0, 0, 0.32)' },
  sm: { light: '0 1px 3px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04)', dark: '0 1px 3px rgba(0, 0, 0, 0.4)' },
  md: { light: '0 8px 20px -6px rgba(16, 24, 40, 0.12), 0 2px 6px -2px rgba(16, 24, 40, 0.06)', dark: '0 8px 24px -6px rgba(0, 0, 0, 0.55)' },
  lg: { light: '0 24px 48px -12px rgba(16, 24, 40, 0.2), 0 8px 16px -8px rgba(16, 24, 40, 0.08)', dark: '0 24px 56px -12px rgba(0, 0, 0, 0.7)' },
} as const satisfies Record<string, Record<Theme, string>>;

export const motion = {
  duration: { fast: 120, base: 180, slow: 240, sheet: 300 },
  ease: { standard: 'cubic-bezier(0.2, 0, 0, 1)', enter: 'cubic-bezier(0.16, 1, 0.3, 1)', exit: 'cubic-bezier(0.4, 0, 1, 1)' },
} as const;

export const focusRing = { widthPx: 2, offsetPx: 2 } as const;

/** The checkbox and radio edge; every other border is a 1px hairline. */
export const strokeStrongPx = 1.5;

export const typefaces = {
  sans: {
    family: 'Inter',
    file: 'Inter-Variable.woff2',
    weights: Object.values(fontWeight),
    opticalSize: true,
    requiredFeatures: ['tnum'],
  },
} as const satisfies Record<
  string,
  { family: string; file: string; weights: readonly number[]; opticalSize: boolean; requiredFeatures: readonly string[] }
>;
