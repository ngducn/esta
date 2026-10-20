'use server';

import type { Result } from '@esta/core/result';
import { meterReadingsSave, runOp, type ReadingsSaved } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type MeterActionRefusal = 'belowPrevious' | 'aboveNext' | 'useTooLarge' | 'monthAfterToday' | 'notFound' | 'failed';

const REFUSALS: Readonly<Record<string, MeterActionRefusal>> = {
  below_previous: 'belowPrevious',
  above_next: 'aboveNext',
  use_too_large: 'useTooLarge',
  month_after_today: 'monthAfterToday',
  not_found: 'notFound',
};

/** LSE-4 `Lưu`: a month's readings, then the bills of every room now read in full issue (SPEC §5.4). */
export async function saveReadings(raw: unknown): Promise<Result<ReadingsSaved, MeterActionRefusal>> {
  const result = await runOp(meterReadingsSave, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: REFUSALS[result.reason.kind] ?? 'failed' };
  revalidatePath('/properties', 'layout');
  revalidatePath('/collections', 'layout');
  return result;
}
