'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { carryCookieLocaleToMember } from '@/server/locale';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

const NAME_MAX = 120;

type NameError = 'required' | 'too-long';

export type CreateHouseholdState = {
  householdName: string;
  displayName: string;
  errors: { householdName?: NameError | undefined; displayName?: NameError | undefined; form?: 'failed' };
};

export type InviteState =
  | { status: 'idle' }
  | { status: 'invited'; email: string; role: Role }
  | { status: 'error'; email: string; role: Role; error: 'invalid-email' | 'already-invited' | 'failed' };

const roleSchema = z.enum(['admin', 'member', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function nameError(value: string): NameError | undefined {
  if (value === '') return 'required';
  if (value.length > NAME_MAX) return 'too-long';
  return undefined;
}

export async function createHousehold(_previous: CreateHouseholdState, formData: FormData): Promise<CreateHouseholdState> {
  const householdName = text(formData, 'householdName');
  const displayName = text(formData, 'displayName');
  const errors = { householdName: nameError(householdName), displayName: nameError(displayName) };
  if (errors.householdName || errors.displayName) return { householdName, displayName, errors };

  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('create_household', { p_name: householdName, p_display_name: displayName });
  if (error && error.code !== '23505') return { householdName, displayName, errors: { form: 'failed' } };
  await carryCookieLocaleToMember();
  redirect('/onboarding');
}

export async function inviteMember(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const role = roleSchema.catch('member').parse(formData.get('role'));
  const email = text(formData, 'email').toLowerCase();
  if (!z.email().safeParse(email).success) return { status: 'error', email, role, error: 'invalid-email' };

  const member = await getCurrentMember();
  if (member === null) redirect('/onboarding');
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('invite_member', { p_household_id: member.household.id, p_email: email, p_role: role });
  if (error) return { status: 'error', email, role, error: error.code === '23505' ? 'already-invited' : 'failed' };
  return { status: 'invited', email, role };
}
