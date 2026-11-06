export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

/** Starts the call twice before either one settles and returns both outcomes, so a count-then-write rule is tried the way two taps race. */
export async function twoAtOnce<T>(call: () => Promise<T>): Promise<readonly [Outcome<T>, Outcome<T>]> {
  const settled = await Promise.allSettled([call(), call()]);
  const [first, second] = settled.map((result): Outcome<T> => (result.status === 'fulfilled' ? { ok: true, value: result.value } : { ok: false, error: result.reason }));
  return [first as Outcome<T>, second as Outcome<T>];
}
