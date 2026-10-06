declare const vndBrand: unique symbol;

export type Vnd = number & { readonly [vndBrand]: true };

export function vnd(n: number): Vnd {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Not a safe integer VND amount: ${n}`);
  return n as Vnd;
}
