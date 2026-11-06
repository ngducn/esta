import { describe, expect, it } from 'vitest';
import { countThenWriteProblems } from './count-then-write.ts';

describe('countThenWriteProblems', () => {
  it('passes the baselined function and nothing else', () => {
    expect(countThenWriteProblems(['public.save_meter_readings'], ['public.save_meter_readings'])).toEqual([]);
  });

  it('fails a new function that counts and inserts without the lock', () => {
    expect(countThenWriteProblems(['public.save_meter_readings', 'public.add_unit'], ['public.save_meter_readings'])).toEqual([
      'public.add_unit counts rows and inserts without pg_advisory_xact_lock; take the lock, or serialize the writers, and test two calls at once',
    ]);
  });

  it('fails a baselined function that now takes the lock, so the list shrinks', () => {
    expect(countThenWriteProblems([], ['public.save_meter_readings'])).toEqual([
      'public.save_meter_readings no longer counts and inserts without a lock; remove it from quality/count-then-write.json',
    ]);
  });
});
