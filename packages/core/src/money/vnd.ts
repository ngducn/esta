declare const vndBrand: unique symbol;

export type Vnd = number & { readonly [vndBrand]: true };

/**
 * `[app rule]` The most any one amount Esta stores may be: a rent, deposit, payment, invoice line or expense. Far
 * above any real figure, so a property's summed amounts stay safe integers. Every money CHECK in SQL uses this number;
 * `scripts/pgtap-fixtures.test.ts` holds the expenses test's ceiling to it.
 */
export const MAX_AMOUNT_VND = 1_000_000_000_000;

export function vnd(n: number): Vnd {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Not a safe integer VND amount: ${n}`);
  return (n === 0 ? 0 : n) as Vnd;
}
