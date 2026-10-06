import { publicTable, type Emitter, type HouseholdSeed } from './context.ts';
import { seedId } from './ids.ts';

export const PEOPLE = [
  { person: 'me', fullName: 'Nguyễn Thị Demo', isOperator: false },
  { person: 'ryan', fullName: 'Trần Minh Demo', isOperator: true },
] as const;

export type Person = (typeof PEOPLE)[number]['person'];

export function householdSeeds(laneCount: number): HouseholdSeed[] {
  const lanes = Array.from({ length: laneCount }, (_, index): HouseholdSeed => ({
    key: `lane-${index + 1}`,
    name: `Gia đình Demo ${index + 1}`,
    emailSuffix: `.lane${index + 1}`,
  }));
  return [{ key: 'demo', name: 'Gia đình Demo', emailSuffix: '' }, ...lanes];
}

export function personKey(person: Person, household: HouseholdSeed): string {
  return `${person}-${household.key}`;
}

export function householdId(household: HouseholdSeed) {
  return seedId(`seed:household:${household.key}`);
}

export function memberId(person: Person, household: HouseholdSeed) {
  return seedId(`seed:member:${personKey(person, household)}`);
}

function userId(person: Person, household: HouseholdSeed) {
  return seedId(`seed:user:${personKey(person, household)}`);
}

function email(person: Person, household: HouseholdSeed): string {
  return `${person}${household.emailSuffix}@demo.esta.test`;
}

const authUsers: Emitter = {
  table: 'auth.users',
  rows: ({ household, asOf }) =>
    PEOPLE.map(({ person }) => ({
      instance_id: '00000000-0000-0000-0000-000000000000',
      id: userId(person, household),
      aud: 'authenticated',
      role: 'authenticated',
      email: email(person, household),
      encrypted_password: '',
      email_confirmed_at: asOf,
      raw_app_meta_data: { provider: 'email', providers: ['email'] },
      raw_user_meta_data: {},
      confirmation_token: '',
      recovery_token: '',
      email_change_token_new: '',
      email_change: '',
    })),
};

const authIdentities: Emitter = {
  table: 'auth.identities',
  rows: ({ household }) =>
    PEOPLE.map(({ person }) => {
      const user = userId(person, household);
      return {
        id: seedId(`seed:identity:${personKey(person, household)}`),
        provider_id: user,
        user_id: user,
        identity_data: { sub: user, email: email(person, household), email_verified: true },
        provider: 'email',
      };
    }),
};

const households = publicTable('households', ({ household }) => [
  { id: householdId(household), name: household.name },
]);

const householdSettings = publicTable('household_settings', ({ household }) => [
  { id: seedId(`seed:household-settings:${household.key}`), household_id: householdId(household) },
]);

const householdMembers = publicTable('household_members', ({ household }) =>
  PEOPLE.map(({ person, fullName, isOperator }) => ({
    id: memberId(person, household),
    household_id: householdId(household),
    user_id: userId(person, household),
    invited_email: email(person, household),
    role: 'admin' as const,
    is_operator: isOperator,
    display_name: fullName,
  })),
);

const notificationPreferences = publicTable('notification_preferences', ({ household }) =>
  PEOPLE.map(({ person }) => ({
    id: seedId(`seed:notification-preference:${personKey(person, household)}:inapp`),
    household_id: householdId(household),
    member_id: memberId(person, household),
    channel: 'inapp',
  })),
);

export const HOUSEHOLD_EMITTERS: readonly Emitter[] = [
  authUsers,
  authIdentities,
  households,
  householdSettings,
  householdMembers,
  notificationPreferences,
];
