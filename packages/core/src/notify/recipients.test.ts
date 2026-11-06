import { describe, expect, it } from 'vitest';
import { noticeKind, recipientsFor, type NoticeItem, type NoticeMember, type NoticePreference } from './recipients';

const me: NoticeMember = { id: 'm1', userId: 'u1', isOperator: false };
const ryan: NoticeMember = { id: 'm2', userId: 'u2', isOperator: true };
const email = (memberId: string, patch: Partial<NoticePreference> = {}): NoticePreference => ({ memberId, channel: 'email', kinds: ['brief', 'action'], dailyCap: 10, ...patch });
const brief: NoticeItem = { kind: 'brief', severity: 'info', audience: 'all' };
const action: NoticeItem = { kind: 'alert', severity: 'action', audience: 'all' };

describe('recipientsFor', () => {
  it('queues a notice for each member who wants the kind', () => {
    expect(recipientsFor(brief, [me, ryan], [email('m1'), email('m2')], new Map())).toEqual([
      { memberId: 'm1', channel: 'email', status: 'queued' },
      { memberId: 'm2', channel: 'email', status: 'queued' },
    ]);
  });

  it('leaves out a member whose email preference lacks the kind, or who has none', () => {
    expect(recipientsFor(action, [me, ryan], [email('m1', { kinds: ['brief'] })], new Map())).toEqual([]);
    expect(recipientsFor(brief, [me], [email('m1', { kinds: ['brief'] }), { memberId: 'm1', channel: 'inapp', kinds: [], dailyCap: null }], new Map())).toHaveLength(1);
    expect(recipientsFor(brief, [me], [{ memberId: 'm1', channel: 'inapp', kinds: ['brief'], dailyCap: null }], new Map())).toEqual([]);
  });

  it('skips a member who reached the daily cap, and counts the notices it queues in the same pass', () => {
    expect(recipientsFor(brief, [me], [email('m1', { dailyCap: 2 })], new Map([['m1', 2]]))).toEqual([{ memberId: 'm1', channel: 'email', status: 'skipped' }]);
    expect(recipientsFor(brief, [me], [email('m1', { dailyCap: 2 })], new Map([['m1', 1]]))[0]?.status).toBe('queued');
  });

  it('treats a missing cap as no cap', () => {
    expect(recipientsFor(brief, [me], [email('m1', { dailyCap: null })], new Map([['m1', 500]]))[0]?.status).toBe('queued');
  });

  it('sends an operator item to operators only', () => {
    expect(recipientsFor({ ...action, audience: 'operator' }, [me, ryan], [email('m1'), email('m2')], new Map()).map((r) => r.memberId)).toEqual(['m2']);
  });

  it('skips an invited member with no account yet', () => {
    expect(recipientsFor(brief, [{ ...me, userId: null }], [email('m1')], new Map())).toEqual([]);
  });

  it('never emails a watch or info note', () => {
    expect(recipientsFor({ kind: 'alert', severity: 'watch', audience: 'all' }, [me], [email('m1')], new Map())).toEqual([]);
    expect(recipientsFor({ kind: 'alert', severity: 'info', audience: 'all' }, [me], [email('m1')], new Map())).toEqual([]);
  });
});

describe('noticeKind', () => {
  it('calls a brief a brief whatever its severity, and any other action note an action', () => {
    expect(noticeKind({ kind: 'brief', severity: 'action' })).toBe('brief');
    expect(noticeKind({ kind: 'proposal', severity: 'action' })).toBe('action');
    expect(noticeKind({ kind: 'answer_note', severity: 'watch' })).toBeNull();
  });
});
