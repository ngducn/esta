'use client';

import { useTransition } from 'react';

/** What a call that threw reads as. An action whose refusals have no `failed` passes its own `failure` instead. */
export const FAILED = { ok: false, reason: 'failed' } as const;

/**
 * Runs a server action inside a transition and settles it with the action's result, or with `failure` when the call
 * threw (offline, a timeout). `pending` stays true until `settle` has run.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const run = <R, F = typeof FAILED>(
    call: () => Promise<R>,
    settle: (result: R | F) => void | Promise<void>,
    failure: F = FAILED as F,
  ) =>
    startTransition(async () => {
      await settle(await call().catch(() => failure));
    });
  return { pending, run };
}
