'use server';

import type { Result } from '@esta/core/result';
import { householdRename, memberInvite, memberRemove, memberSetRole, runOp, type CommonRefusal, type MemberRefusal, type MemberSaved, type Op } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type MemberActionRefusal = 'invalid' | 'lastAdmin' | 'operator' | 'alreadyMember' | 'alreadyInvited' | 'notFound' | 'forbidden' | 'failed';

const KIND_REFUSALS: Readonly<Record<(MemberRefusal | CommonRefusal)['kind'], MemberActionRefusal>> = {
  invalid: 'invalid',
  last_admin: 'lastAdmin',
  operator: 'operator',
  already_member: 'alreadyMember',
  already_invited: 'alreadyInvited',
  not_found: 'notFound',
  forbidden: 'forbidden',
  conflict: 'failed',
  failed: 'failed',
};

async function runMemberOp<I, C>(op: Op<I, C, MemberSaved, MemberRefusal>, raw: unknown): Promise<Result<undefined, MemberActionRefusal>> {
  const result = await runOp(op, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: KIND_REFUSALS[result.reason.kind] };
  revalidatePath('/', 'layout');
  return { ok: true, value: undefined };
}

export async function renameHousehold(raw: unknown): Promise<Result<undefined, MemberActionRefusal>> {
  return runMemberOp(householdRename, raw);
}

export async function inviteMember(raw: unknown): Promise<Result<undefined, MemberActionRefusal>> {
  return runMemberOp(memberInvite, raw);
}

export async function setMemberRole(raw: unknown): Promise<Result<undefined, MemberActionRefusal>> {
  return runMemberOp(memberSetRole, raw);
}

export async function removeMember(raw: unknown): Promise<Result<undefined, MemberActionRefusal>> {
  return runMemberOp(memberRemove, raw);
}
