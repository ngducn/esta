import { tones, type ColorToken } from './tokens';

/** WCAG 2.2: body text at AAA (7:1), other text at AA (1.4.3, 4.5:1), and focus rings, field edges and icons that carry meaning at 3:1 (1.4.11). */
export const minimumRatio = { body: 7, text: 4.5, shape: 3 } as const;

/** `opacity` is the percent of a translucent background (`bg-bg/85`), which the check blends into each ground and holds to the lowest ratio. */
export type ColorPair = { kind: keyof typeof minimumRatio; foreground: ColorToken; background: ColorToken; opacity?: number };

/** Text with no background of its own sits on the page, a quiet block, a card or a menu. */
export const grounds = ['bg', 'bg-subtle', 'surface', 'surface-raised'] as const satisfies readonly ColorToken[];

const onGrounds = (kind: ColorPair['kind'], foreground: ColorToken): ColorPair[] =>
  grounds.map((background) => ({ kind, foreground, background }));

/** Every pair in the contrast table of docs/design/redesign-2026-11/01-foundations.md, widened to every ground, plus the pairs only Esta draws. */
export const colorPairs: readonly ColorPair[] = [
  ...onGrounds('body', 'text'),
  ...onGrounds('body', 'text-secondary'),
  ...onGrounds('text', 'text-muted'),
  ...onGrounds('text', 'accent-text'),
  ...tones.flatMap((tone): ColorPair[] => [
    ...onGrounds('text', `${tone}-text`),
    { kind: 'text', foreground: `${tone}-text`, background: `${tone}-bg` },
    { kind: 'text', foreground: `on-${tone}`, background: `${tone}-solid` },
  ]),
  { kind: 'body', foreground: 'text-inverse', background: 'surface-inverse' },
  { kind: 'text', foreground: 'text-inverse-accent', background: 'surface-inverse' },
  { kind: 'text', foreground: 'accent-text', background: 'accent-subtle' },
  { kind: 'text', foreground: 'on-accent', background: 'accent' },
  { kind: 'text', foreground: 'on-accent', background: 'accent-hover' },
  { kind: 'text', foreground: 'on-accent', background: 'accent-pressed' },
  { kind: 'text', foreground: 'text', background: 'accent-subtle-hover' },
  { kind: 'body', foreground: 'text', background: 'accent-subtle' },
  { kind: 'body', foreground: 'text', background: 'fill-hover' },
  { kind: 'body', foreground: 'text', background: 'fill-pressed' },
  { kind: 'body', foreground: 'text-secondary', background: 'fill-hover' },
  { kind: 'text', foreground: 'on-danger', background: 'red-700' },
  { kind: 'text', foreground: 'on-danger', background: 'red-800' },
  { kind: 'text', foreground: 'inverse-success', background: 'surface-inverse' },
  { kind: 'text', foreground: 'inverse-danger', background: 'surface-inverse' },
  { kind: 'text', foreground: 'qr-ink', background: 'qr-paper' },
  ...onGrounds('shape', 'focus-ring'),
  ...onGrounds('shape', 'border-field'),
];
