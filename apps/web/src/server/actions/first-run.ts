'use server';

import { firstRunSetDismissed, runOp, type FirstRunDismissed } from '@esta/ops';
import type { Result } from '@esta/core/result';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

async function setDismissed(dismissed: boolean): Promise<Result<FirstRunDismissed, unknown>> {
  const result = await runOp(firstRunSetDismissed, await webOpContext(), { dismissed });
  if (result.ok) revalidatePath('/');
  return result;
}

export async function dismissFirstRun(): Promise<Result<FirstRunDismissed, unknown>> {
  return setDismissed(true);
}

export async function restoreFirstRun(): Promise<{ readonly ok: boolean }> {
  return { ok: (await setDismissed(false)).ok };
}
