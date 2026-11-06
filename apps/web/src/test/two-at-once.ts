/** Starts the call twice before either one settles and returns both outcomes, so a count-then-write rule is tried the way two taps race. */
export function twoAtOnce<T>(call: () => Promise<T>) {
  return Promise.allSettled([call(), call()]);
}
