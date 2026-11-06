export type NoticeKind = 'brief' | 'action';

export type NoticeItem = {
  readonly kind: string;
  readonly severity: 'info' | 'watch' | 'action';
  readonly audience: 'all' | 'operator';
};

export type NoticeMember = {
  readonly id: string;
  readonly userId: string | null;
  readonly isOperator: boolean;
};

export type NoticePreference = {
  readonly memberId: string;
  readonly channel: 'inapp' | 'email' | 'push';
  readonly kinds: readonly string[];
  readonly dailyCap: number | null;
};

export type Recipient = { readonly memberId: string; readonly channel: 'email'; readonly status: 'queued' | 'skipped' };

/** Only a brief and an `action` note reach an inbox; `watch` and `info` notes stay in the thread (PLT-4). */
export function noticeKind(item: Pick<NoticeItem, 'kind' | 'severity'>): NoticeKind | null {
  if (item.kind === 'brief') return 'brief';
  return item.severity === 'action' ? 'action' : null;
}

/**
 * Who gets an email notice for `item`. A member who left the kind out of their email preference gets no row at all;
 * one who reached `daily_cap` gets a `skipped` row, so the item is not offered again on the next tick. `sentToday`
 * counts the notices already counted against each member's cap today.
 */
export function recipientsFor(
  item: NoticeItem,
  members: readonly NoticeMember[],
  preferences: readonly NoticePreference[],
  sentToday: ReadonlyMap<string, number>,
): Recipient[] {
  const kind = noticeKind(item);
  if (kind === null) return [];
  const taken = new Map(sentToday);
  return members.flatMap((member): Recipient[] => {
    if (member.userId === null) return [];
    if (item.audience === 'operator' && !member.isOperator) return [];
    const wants = preferences.find((preference) => preference.memberId === member.id && preference.channel === 'email');
    if (wants === undefined || !wants.kinds.includes(kind)) return [];
    const count = taken.get(member.id) ?? 0;
    if (wants.dailyCap !== null && count >= wants.dailyCap) return [{ memberId: member.id, channel: 'email', status: 'skipped' }];
    taken.set(member.id, count + 1);
    return [{ memberId: member.id, channel: 'email', status: 'queued' }];
  });
}
