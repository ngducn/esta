export type Oklch = readonly [lightnessPercent: number, chroma: number, hueDegrees: number];

export type Theme = 'light' | 'dark';

/** Light values come from the approved 2026-10 mock (docs/design/redesign-2026-10); the hex each one renders as is in DESIGN.md. */
export const colors = {
  ground: { light: [97.3, 0.003, 265], dark: [16, 0.008, 265] },
  surface: { light: [99.5, 0.002, 265], dark: [20.5, 0.01, 265] },
  'surface-2': { light: [98.2, 0.003, 265], dark: [23.5, 0.011, 265] },
  ink: { light: [20.9, 0.01, 268], dark: [94, 0.006, 265] },
  'ink-2': { light: [30.5, 0.021, 266], dark: [87, 0.01, 265] },
  'ink-muted': { light: [49.3, 0.025, 268], dark: [74, 0.018, 265] },
  rule: { light: [93.4, 0.007, 269], dark: [29, 0.012, 265] },
  'rule-strong': { light: [90.3, 0.009, 265], dark: [36, 0.014, 265] },
  field: { light: [62, 0.022, 265], dark: [56, 0.02, 265] },
  accent: { light: [53, 0.166, 32], dark: [72, 0.14, 32] },
  'accent-pressed': { light: [47, 0.166, 32], dark: [66, 0.14, 32] },
  'accent-tint': { light: [95, 0.014, 28], dark: [27, 0.04, 30] },
  'on-accent': { light: [99, 0.004, 32], dark: [18, 0.02, 30] },
  paid: { light: [46.9, 0.112, 153], dark: [80, 0.12, 155] },
  due: { light: [47.9, 0.111, 59], dark: [83, 0.12, 75] },
  overdue: { light: [48.5, 0.165, 30], dark: [78, 0.12, 28] },
  vacant: { light: [43.2, 0.038, 267], dark: [81, 0.025, 265] },
  'paid-fill': { light: [96.8, 0.016, 161], dark: [27, 0.04, 155] },
  'due-fill': { light: [97.2, 0.022, 80], dark: [28, 0.04, 70] },
  'overdue-fill': { light: [96, 0.017, 27], dark: [27, 0.05, 28] },
  'vacant-fill': { light: [96, 0.005, 258], dark: [27, 0.012, 265] },
} as const satisfies Record<string, Record<Theme, Oklch>>;

export type ColorToken = keyof typeof colors;

/** Each status draws its shape and word in its own token, on its `-fill` token or on a plain ground. */
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
  h3: { px: 20, leading: leading.snug },
  h2: { px: 24, leading: leading.tight },
  h1: { px: 30, leading: leading.tight },
  hero: { px: 34, leading: leading.tight },
  'hero-xl': { px: 44, leading: leading.tight },
} as const satisfies Record<string, { px: number; leading: number }>;

/** The weights the variable font ships; Tailwind offers no other `font-*` weight. */
export const fontWeight = { normal: 400, medium: 500, semibold: 600, bold: 700 } as const;

export const spacing = { unitPx: 4, touchPx: 44 } as const;

/** Compact retunes the one spacing unit every `p-*`, `gap-*` and `m-*` multiplies, and leaves type alone. */
export const densities = { comfortable: { unitPx: 4 }, compact: { unitPx: 3 } } as const;

export type Density = keyof typeof densities;

export const densityNames = Object.keys(densities) as Density[];

export const isDensity = (value: unknown): value is Density => densityNames.some((name) => name === value);

export const textScales = [100, 115, 130] as const;

export type TextScale = (typeof textScales)[number];

export const shell = { sidebarPx: 240, contentPx: 1200 } as const;

/** Controls take `sm`, fields and icon tiles `md`, cards `lg`. */
export const radius = { xs: 6, sm: 10, md: 12, lg: 16, full: 9999 } as const;

/** A fixed cool ink rather than a theme token, so the shadow never turns light in dark mode. */
export const shadows = {
  card: '0 0.0625rem 0.125rem oklch(25% 0.02 265 / 0.05), 0 0.0625rem 0.1875rem oklch(25% 0.02 265 / 0.04)',
  sheet: '0 -0.25rem 1.5rem oklch(20% 0.02 265 / 0.14)',
} as const;

export const motion = {
  duration: { fast: 150, base: 180, slow: 220 },
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const typefaces = {
  sans: {
    family: 'Plus Jakarta Sans',
    file: 'PlusJakartaSans-Variable.woff2',
    weights: Object.values(fontWeight),
    opticalSize: false,
    requiredFeatures: ['tnum'],
  },
} as const satisfies Record<
  string,
  { family: string; file: string; weights: readonly number[]; opticalSize: boolean; requiredFeatures: readonly string[] }
>;
