import { describe, expect, it } from 'vitest';
import { awaitingReview, type DocumentStatuses } from './extraction-status';

const read = (statuses: DocumentStatuses['statuses']): DocumentStatuses => ({ statuses, workerOffline: false });

describe('awaitingReview', () => {
  it('counts the documents whose reading waits for a person', () => {
    expect(awaitingReview(read({ a: 'needs_review', b: 'accepted', c: 'needs_review' }))).toBe(2);
  });

  it('is zero when the read succeeded and nothing waits', () => {
    expect(awaitingReview(read({ a: 'accepted' }))).toBe(0);
    expect(awaitingReview(read({}))).toBe(0);
  });

  it('is unknown, not zero, when the status read failed', () => {
    expect(awaitingReview(null)).toBeNull();
  });
});
