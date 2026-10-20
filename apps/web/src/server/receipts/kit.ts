import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReceiptModel } from '@esta/core/receipt';
import { oklchHex, oklchToSrgb255, type Rgb } from '@/design/contrast';
import { colors, type ColorToken } from '@/design/tokens';

/** The receipt's own words, always Vietnamese (messages `receipt`), resolved on the server. The title is the model's. */
export type ReceiptLabels = {
  readonly number: string;
  readonly issuedOn: string;
  readonly tenant: string;
  readonly place: string;
  readonly period: string;
  readonly lines: string;
  readonly total: string;
  readonly words: string;
  readonly received: string;
  readonly outstanding: string;
  readonly paidInFull: string;
  readonly scanToPay: string;
  readonly memo: string;
  readonly account: string;
};

export type Receipt = ReceiptModel<ReceiptLabels>;

/** A5 in PDF points (ISO 216, 148 × 210 mm). */
export const A5_PT = { width: 419.528, height: 595.276 } as const;

/** The Zalo picture: 1080 px wide, sharp on a phone screen, and A5's ratio unless a long bill makes it taller. */
export const PNG_PX = { width: 1080, height: 1527 } as const;

/** Paper is white in either theme, so the receipt reads the light tokens. */
export const receiptColor = (token: ColorToken): Rgb => oklchToSrgb255(colors[token].light);

export const receiptHex = (token: ColorToken) => oklchHex(colors[token].light);

export type ReceiptFont = { readonly weight: 400 | 700; readonly data: Buffer };

let fonts: readonly ReceiptFont[] | undefined;

/**
 * Static instances of the app's Plus Jakarta Sans subset (`pnpm fonts:build`). They load from `process.cwd()`, which
 * `next.config.ts` traces into the route, because pdf-lib and satori take TrueType bytes, not a CSS font.
 */
export function receiptFonts(): readonly ReceiptFont[] {
  fonts ??= ([['Regular', 400], ['Bold', 700]] as const).map(([name, weight]) => ({
    weight,
    data: readFileSync(join(process.cwd(), 'src/server/receipts/fonts', `PlusJakartaSans-${name}.ttf`)),
  }));
  return fonts;
}

export function receiptFont(weight: ReceiptFont['weight']): Buffer {
  const found = receiptFonts().find((font) => font.weight === weight);
  if (found === undefined) throw new Error(`No receipt font at weight ${weight}`);
  return found.data;
}
