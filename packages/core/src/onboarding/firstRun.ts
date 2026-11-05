export type FirstRunRole = 'admin' | 'member' | 'viewer';

export type FirstRunSnapshot = {
  readonly role: FirstRunRole;
  readonly propertyCount: number;
  readonly bankAccountCount: number;
  /** Every `household_members` row, claimed or still pending: the person who invites has done their part. */
  readonly memberCount: number;
  readonly dismissedAt: string | null;
};

export type FirstRunStepId = 'add-property' | 'add-bank-account' | 'invite-member';

export type FirstRunStep = {
  readonly id: FirstRunStepId;
  readonly titleKey: 'addPropertyTitle' | 'addBankAccountTitle' | 'inviteMemberTitle';
  readonly actionKey: 'addPropertyAction' | 'addBankAccountAction' | 'inviteMemberAction';
  readonly href: string;
  readonly isDone: (snapshot: FirstRunSnapshot) => boolean;
};

export const FIRST_RUN_STEPS: readonly FirstRunStep[] = [
  { id: 'add-property', titleKey: 'addPropertyTitle', actionKey: 'addPropertyAction', href: '/properties/new', isDone: (s) => s.propertyCount > 0 },
  { id: 'add-bank-account', titleKey: 'addBankAccountTitle', actionKey: 'addBankAccountAction', href: '/settings#accounts', isDone: (s) => s.bankAccountCount > 0 },
  { id: 'invite-member', titleKey: 'inviteMemberTitle', actionKey: 'inviteMemberAction', href: '/settings#members', isDone: (s) => s.memberCount > 1 },
];

/** Only an admin can do the steps and write the dismissal, so a member or a viewer is never shown an action that fails. */
const FIRST_RUN_ROLES: readonly FirstRunRole[] = ['admin'];

export type FirstRunState = {
  readonly steps: readonly (FirstRunStep & { readonly done: boolean })[];
  readonly visible: boolean;
};

export function firstRunState(snapshot: FirstRunSnapshot): FirstRunState {
  const steps = FIRST_RUN_STEPS.map((step) => ({ ...step, done: step.isDone(snapshot) }));
  const visible = FIRST_RUN_ROLES.includes(snapshot.role) && snapshot.dismissedAt === null && steps.some((step) => !step.done);
  return { steps, visible };
}
