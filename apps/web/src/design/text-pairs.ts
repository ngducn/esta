import { statuses, type ColorToken } from './tokens';

/** WCAG 2.2 minimums: 1.4.3 for text, 1.4.11 for the control borders and shapes that carry meaning. */
export const minimumRatio = { text: 4.5, shape: 3 } as const;

/** `opacity` is the percent of a translucent background (`bg-accent/90`), which the check blends into each ground and holds to the lowest ratio. */
export type ColorPair = { kind: 'text' | 'shape'; foreground: ColorToken; background: ColorToken; opacity?: number };

/** Text with no background of its own sits on the page, on a card or on a table header. */
export const grounds = ['ground', 'surface', 'surface-2'] as const satisfies readonly ColorToken[];

const onGrounds = (kind: ColorPair['kind'], foreground: ColorToken): ColorPair[] =>
  grounds.map((background) => ({ kind, foreground, background }));

export const colorPairs: readonly ColorPair[] = [
  ...(['ink', 'ink-2', 'ink-muted', 'accent', ...statuses] as const).flatMap((foreground) => onGrounds('text', foreground)),
  ...statuses.map((status): ColorPair => ({ kind: 'text', foreground: status, background: `${status}-fill` })),
  { kind: 'text', foreground: 'on-accent', background: 'accent' },
  { kind: 'text', foreground: 'on-accent', background: 'accent-pressed' },
  { kind: 'text', foreground: 'on-accent', background: 'accent', opacity: 90 },
  { kind: 'text', foreground: 'surface', background: 'ink', opacity: 88 },
  { kind: 'text', foreground: 'surface', background: 'ink', opacity: 80 },
  { kind: 'text', foreground: 'accent', background: 'accent-tint' },
  { kind: 'text', foreground: 'ink', background: 'accent-tint' },
  { kind: 'text', foreground: 'surface', background: 'ink' },
  { kind: 'text', foreground: 'ink', background: 'rule' },
  { kind: 'text', foreground: 'ink-muted', background: 'rule' },
  { kind: 'text', foreground: 'qr-ink', background: 'qr-paper' },
  ...onGrounds('shape', 'field'),
];
