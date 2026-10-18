import { describe, expect, it } from 'vitest';
import { retryHint } from './retry-hint';

const retry = { type: 'retry_job', params: { job_id: 'job-1' }, min_role: 'admin' };

describe('retryHint', () => {
  it('offers the retry to an admin and tells a member or viewer that an admin can do it', () => {
    expect(retryHint(retry, 'admin')).toBe('self');
    expect(retryHint(retry, 'member')).toBe('ask');
    expect(retryHint(retry, 'viewer')).toBe('ask');
  });

  it('says nothing for an item without a retry', () => {
    expect(retryHint(null, 'admin')).toBeNull();
    expect(retryHint({ type: 'accept_extraction', min_role: 'member' }, 'admin')).toBeNull();
  });
});
