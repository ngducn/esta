import type { ColorToken } from './tokens';

/** WCAG 2.2 minimums: 1.4.3 for text, 1.4.11 for the status shapes that carry meaning. */
export const minimumRatio = { text: 4.5, shape: 3 } as const;

export type PairKind = keyof typeof minimumRatio;

export type ColorPair = { foreground: ColorToken; background: ColorToken; kind: PairKind };

const grounds = ['paper', 'surface'] as const satisfies readonly ColorToken[];

const onGrounds = (foreground: ColorToken, kind: PairKind): ColorPair[] =>
  grounds.map((background) => ({ foreground, background, kind }));

/** Every foreground and background pair the UI draws. A new pairing is added here before it ships. */
export const colorPairs: readonly ColorPair[] = [
  ...onGrounds('ink', 'text'),
  ...onGrounds('ink-muted', 'text'),
  ...onGrounds('lacquer', 'text'),
  ...onGrounds('paid-ink', 'text'),
  ...onGrounds('due-ink', 'text'),
  ...onGrounds('overdue-ink', 'text'),
  ...onGrounds('vacant-ink', 'text'),
  { foreground: 'paper', background: 'ink', kind: 'text' },
  ...onGrounds('paid', 'shape'),
  ...onGrounds('due', 'shape'),
  ...onGrounds('overdue', 'shape'),
  ...onGrounds('vacant', 'shape'),
];
