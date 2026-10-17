import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False in the server HTML and during hydration, true once React owns the page. A form disables its submit button
 * until then, because the browser would otherwise submit it as a GET and navigate away before `onSubmit` exists.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
