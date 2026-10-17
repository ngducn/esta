import type { Locale } from '../format';
import type { Result } from '../result';

/** 100% in basis points; `ownership_shares.share_bp` runs from 1 to this. */
export const FULL_SHARE_BP = 10_000;

export type OwnershipState = 'complete' | 'under' | 'over';
export type OwnershipStatus = { readonly totalBp: number; readonly state: OwnershipState };

const PERCENT = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

/** `33,33`, `33.33` and `33,33 %` are 3333 bp. More than two decimals is `invalid`; 0 or above 100 is `range`. */
export function percentToBp(text: string): Result<number, 'invalid' | 'range'> {
  const match = PERCENT.exec(text.trim().replace(/\s*%$/, ''));
  if (match === null) return { ok: false, reason: 'invalid' };
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp >= 1 && bp <= FULL_SHARE_BP ? { ok: true, value: bp } : { ok: false, reason: 'range' };
}

const percentFormats: Record<Locale, Intl.NumberFormat> = {
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2, useGrouping: false }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false }),
};

/** The number a share input starts from: 3333 bp is `33,33` in Vietnamese, and `percentToBp` reads it back. */
export function bpToPercentText(bp: number, locale: Locale): string {
  return percentFormats[locale].format(bp / 100);
}

export function formatShareBp(bp: number, locale: Locale): string {
  return `${bpToPercentText(bp, locale)}%`;
}

/** PRP-3: a set that does not reach exactly 100% still saves, and the property shows a warning until it does. */
export function ownershipStatus(shares: readonly { readonly share_bp: number }[]): OwnershipStatus {
  const totalBp = shares.reduce((sum, share) => sum + share.share_bp, 0);
  return { totalBp, state: totalBp === FULL_SHARE_BP ? 'complete' : totalBp < FULL_SHARE_BP ? 'under' : 'over' };
}
