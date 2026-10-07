export type Oklch = readonly [lightnessPercent: number, chroma: number, hueDegrees: number];

export type Theme = 'light' | 'dark';

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

/** Every line height the UI may use. pnpm check rejects any below `minimumLeading`. */
export const leading = { tight: 1.3, snug: 1.35, normal: 1.45, relaxed: 1.5 } as const;

/** Vietnamese stacked marks (ặ, ữ, Ướ) collide with the line above below this. */
export const minimumLeading = 1.3;

export const typeScale = {
  meta: { px: 13, leading: leading.normal },
  small: { px: 15, leading: leading.normal },
  body: { px: 16, leading: leading.relaxed },
  lead: { px: 18, leading: leading.normal },
  h3: { px: 22, leading: leading.snug },
  h2: { px: 28, leading: leading.tight },
  h1: { px: 36, leading: leading.tight },
  hero: { px: 44, leading: leading.tight },
  'hero-xl': { px: 56, leading: leading.tight },
} as const satisfies Record<string, { px: number; leading: number }>;

/** The weights both variable fonts ship; Tailwind offers no other `font-*` weight. */
export const fontWeight = { normal: 400, medium: 500, semibold: 600 } as const;

export const spacing = { unitPx: 4, touchPx: 44 } as const;

export const motion = {
  duration: { fast: 150, base: 180, slow: 220 },
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const typefaces = {
  sans: {
    family: 'Source Sans 3',
    file: 'SourceSans3-Variable.woff2',
    weights: Object.values(fontWeight),
    opticalSize: false,
    requiredFeatures: [],
  },
  figure: {
    family: 'Source Serif 4',
    file: 'SourceSerif4-Variable.woff2',
    weights: Object.values(fontWeight),
    opticalSize: true,
    requiredFeatures: ['tnum', 'lnum'],
  },
} as const satisfies Record<
  string,
  { family: string; file: string; weights: readonly number[]; opticalSize: boolean; requiredFeatures: readonly string[] }
>;
