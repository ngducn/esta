import type { MemberActionRefusal } from '@/server/actions/members';

export type Refusals = Readonly<Record<MemberActionRefusal, string>>;
