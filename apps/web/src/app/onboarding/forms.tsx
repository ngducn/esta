'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, type RefObject } from 'react';
import { createHousehold, inviteMember, type CreateHouseholdState, type InviteState, type Role } from './actions';
import { NAME_MAX_LENGTH } from './limits';

const ROLES: readonly Role[] = ['admin', 'member', 'viewer'];

const fieldClass = 'min-h-11 w-full rounded-md border border-current px-3 text-base';
const primaryClass = 'min-h-11 w-full rounded-md border-2 border-current px-4 font-semibold disabled:opacity-60';

const initialCreate: CreateHouseholdState = { householdName: '', displayName: '', errors: {} };
const initialInvite: InviteState = { status: 'idle' };

const INVITE_ERRORS = {
  'invalid-email': 'invalidEmail',
  'already-invited': 'alreadyInvited',
  failed: 'inviteFailed',
} as const;

function useFocusFirstInvalid(state: object): RefObject<HTMLFormElement | null> {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return form;
}

function TextField({
  name,
  label,
  hint,
  defaultValue,
  error,
  autoComplete,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  error: string | null;
  autoComplete: string;
}) {
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="font-semibold">
        {label}
      </label>
      <p id={hintId}>{hint}</p>
      <input
        id={name}
        name={name}
        type="text"
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        maxLength={NAME_MAX_LENGTH}
        aria-invalid={error !== null}
        aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
        className={fieldClass}
      />
      {error !== null && (
        <p id={errorId} role="alert" className="font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

export function CreateHouseholdForm() {
  const t = useTranslations('onboarding');
  const [state, action, pending] = useActionState(createHousehold, initialCreate);
  const form = useFocusFirstInvalid(state);
  const message = (error: 'required' | 'too-long' | undefined, required: string) =>
    error === 'required' ? required : error === 'too-long' ? t('tooLong') : null;
  return (
    <form ref={form} action={action} className="flex flex-col gap-6" noValidate>
      <TextField
        name="householdName"
        label={t('householdName')}
        hint={t('householdNameHint')}
        defaultValue={state.householdName}
        error={message(state.errors.householdName, t('householdNameRequired'))}
        autoComplete="off"
      />
      <TextField
        name="displayName"
        label={t('displayName')}
        hint={t('displayNameHint')}
        defaultValue={state.displayName}
        error={message(state.errors.displayName, t('displayNameRequired'))}
        autoComplete="name"
      />
      {state.errors.form === 'failed' && (
        <p role="alert" className="font-semibold">
          {t('createFailed')}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryClass}>
        {pending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function InviteForm() {
  const t = useTranslations('onboarding');
  const [state, action, pending] = useActionState(inviteMember, initialInvite);
  const form = useFocusFirstInvalid(state);
  const failed = state.status === 'error' ? state : null;
  const error = failed === null ? null : t(INVITE_ERRORS[failed.error]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-semibold">
          {t('inviteEmail')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={failed?.email ?? ''}
          aria-invalid={failed?.error === 'invalid-email'}
          aria-describedby={error === null ? undefined : 'invite-error'}
          className={fieldClass}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{t('role')}</legend>
        {ROLES.map((role) => (
          <label key={role} className="flex min-h-11 items-start gap-3 py-1">
            <input
              type="radio"
              name="role"
              value={role}
              defaultChecked={role === (failed?.role ?? 'member')}
              className="mt-1 size-5"
            />
            <span>
              <span className="block font-semibold">{t(`roles.${role}`)}</span>
              <span className="block">{t(`roleHints.${role}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p role="status" className="min-h-6 font-semibold">
        {state.status === 'invited' ? t('invited', { email: state.email, role: t(`roles.${state.role}`) }) : null}
      </p>
      {error !== null && (
        <p id="invite-error" role="alert" className="font-semibold">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryClass}>
        {pending ? t('inviting') : t('invite')}
      </button>
    </form>
  );
}
