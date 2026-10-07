import { statuses, type ColorToken, type Status } from './tokens';

/** WCAG 2.2 minimums: 1.4.3 for text, 1.4.11 for the status shapes that carry meaning. */
export const minimumRatio = { text: 4.5, shape: 3 } as const;

export type ColorPair =
  | { kind: 'text'; foreground: Exclude<ColorToken, Status>; background: ColorToken }
  | { kind: 'shape'; foreground: Status; background: ColorToken };

const grounds = ['paper', 'surface'] as const satisfies readonly ColorToken[];

const textOnGrounds = (foreground: Exclude<ColorToken, Status>): ColorPair[] =>
  grounds.map((background) => ({ kind: 'text', foreground, background }));
const shapeOnGrounds = (foreground: Status): ColorPair[] =>
  grounds.map((background) => ({ kind: 'shape', foreground, background }));

export const colorPairs: readonly ColorPair[] = [
  ...(['ink', 'ink-muted', 'lacquer', 'paid-ink', 'due-ink', 'overdue-ink', 'vacant-ink'] as const).flatMap(textOnGrounds),
  { kind: 'text', foreground: 'paper', background: 'ink' },
  ...statuses.flatMap(shapeOnGrounds),
];
