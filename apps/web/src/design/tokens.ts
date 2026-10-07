/** OKLCH as [lightness in percent, chroma, hue in degrees]. */
export type Oklch = readonly [lightness: number, chroma: number, hue: number];

export type Theme = 'light' | 'dark';

/**
 * DESIGN-BRIEF §5.2. Status hues are for shapes, fills and borders (3:1); each `-ink` variant keeps
 * the hue and is the only form of that status used for text (4.5:1).
 */
export const colors = {
  paper: { light: [98.5, 0.006, 85], dark: [19, 0.01, 60] },
  surface: { light: [99.6, 0.003, 85], dark: [23, 0.011, 60] },
  ink: { light: [24, 0.02, 60], dark: [93, 0.012, 80] },
  'ink-muted': { light: [48, 0.015, 60], dark: [74, 0.012, 70] },
  rule: { light: [90, 0.01, 80], dark: [33, 0.01, 60] },
  lacquer: { light: [42, 0.11, 35], dark: [70, 0.1, 35] },
  paid: { light: [52, 0.09, 165], dark: [68, 0.1, 165] },
  due: { light: [64, 0.13, 75], dark: [76, 0.13, 75] },
  overdue: { light: [56, 0.19, 28], dark: [66, 0.17, 28] },
  vacant: { light: [60, 0.03, 250], dark: [66, 0.03, 250] },
  'paid-ink': { light: [44, 0.08, 165], dark: [80, 0.09, 165] },
  'due-ink': { light: [46, 0.09, 75], dark: [84, 0.11, 75] },
  'overdue-ink': { light: [48, 0.17, 28], dark: [78, 0.12, 28] },
  'vacant-ink': { light: [46, 0.03, 250], dark: [80, 0.025, 250] },
} as const satisfies Record<string, Record<Theme, Oklch>>;

export type ColorToken = keyof typeof colors;

export const statuses = ['paid', 'due', 'overdue', 'vacant'] as const satisfies readonly ColorToken[];

export type Status = (typeof statuses)[number];

/** DESIGN-BRIEF §5.1, in px at text scale 1. Leading stays at 1.3 or more so stacked marks clear the line above. */
export const typeScale = {
  meta: { size: 13, leading: 1.45 },
  small: { size: 15, leading: 1.45 },
  body: { size: 16, leading: 1.5 },
  lead: { size: 18, leading: 1.45 },
  h3: { size: 22, leading: 1.35 },
  h2: { size: 28, leading: 1.3 },
  h1: { size: 36, leading: 1.3 },
  hero: { size: 44, leading: 1.3 },
  'hero-xl': { size: 56, leading: 1.3 },
} as const satisfies Record<string, { size: number; leading: number }>;

/** User text scale (PRODUCT.md): 100, 115 and 130 percent of the root size. */
export const textScales = [1, 1.15, 1.3] as const;

/**
 * In px at text scale 1. Spacing steps are multiples of `unit` (Tailwind `p-4` is 16 px); `touch` is
 * the 44 px minimum target (`min-h-touch`).
 */
export const spacing = { unit: 4, touch: 44 } as const;

export const motion = {
  duration: { fast: 150, base: 180, slow: 220 },
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/**
 * Every face and weight the UI uses. `pnpm glyphs:check` tests each file at these weights, at the
 * smallest and largest type size on its optical size axis, and for its required OpenType features.
 */
export const typefaces = {
  sans: {
    family: 'Source Sans 3',
    file: 'SourceSans3-Variable.woff2',
    weights: [400, 500, 600, 700],
    opticalSize: false,
    requiredFeatures: [],
  },
  figure: {
    family: 'Source Serif 4',
    file: 'SourceSerif4-Variable.woff2',
    weights: [400, 500, 600],
    opticalSize: true,
    requiredFeatures: ['tnum', 'lnum'],
  },
} as const satisfies Record<
  string,
  { family: string; file: string; weights: readonly number[]; opticalSize: boolean; requiredFeatures: readonly string[] }
>;
