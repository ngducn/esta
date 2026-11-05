import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import type { Member } from '@/server/member';
import { loadMembers } from '@/server/settings/load';
import { InviteButton } from './invite-button';
import { MemberActions } from './member-actions';
import { memberRefusals } from './member-refusals';
import { SettingsSection } from './settings-section';

export async function MembersSection({ member }: { member: Member }) {
  const admin = member.role === 'admin';
  const [t, members, refusals] = await Promise.all([getTranslations('settings'), loadMembers(member.household.id), admin ? memberRefusals() : null]);
  const roles = { admin: t('roles.admin'), member: t('roles.member'), viewer: t('roles.viewer') };
  return (
    <SettingsSection id="members" title={t('members')} intro={admin ? t('membersIntro') : t('membersReadOnly')}>
      <Card className="p-0 sm:p-0">
        <ul className="flex flex-col divide-y divide-border">
          {members.map((row) => {
            const name = row.displayName ?? row.email;
            const self = row.id === member.id;
            return (
              <li key={row.id} data-testid="member-row" className="flex flex-col gap-3 p-5 sm:p-6">
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-headline font-semibold break-words">{name}</h3>
                    {self ? <span className="text-body-sm text-text-muted">{t('memberSelf')}</span> : null}
                    {row.signedIn ? null : (
                      <span data-testid="member-pending" className="rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-body-sm font-medium text-text">
                        {t('memberPending')}
                      </span>
                    )}
                  </div>
                  {row.displayName === null ? null : <p className="text-body-sm break-all text-text-secondary">{row.email}</p>}
                  {admin && !row.isOperator ? null : (
                    <p data-testid="member-role-text" className="text-body-sm text-text-secondary">
                      {roles[row.role]}
                    </p>
                  )}
                </div>
                {admin && !row.isOperator && refusals !== null ? (
                  <MemberActions
                    id={row.id}
                    role={row.role}
                    self={self}
                    labels={{
                      role: t('memberRole'),
                      roles,
                      remove: t('memberRemove'),
                      removeTitle: t('memberRemoveTitle', { name }),
                      removeBody: t('memberRemoveBody'),
                      removeConfirm: t('memberRemoveConfirm'),
                      keep: t('memberKeep'),
                      selfTitle: t('memberSelfTitle'),
                      selfBody: t('memberSelfBody'),
                      selfConfirm: t('memberSelfConfirm'),
                      refusals,
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
      {admin && refusals !== null ? (
        <InviteButton
          label={t('inviteOpen')}
          labels={{ title: t('inviteTitle'), body: t('inviteBody'), email: t('inviteEmail'), emailHint: t('inviteEmailHint'), save: t('inviteSave'), saving: t('saving'), close: t('inviteClose'), refusals }}
        />
      ) : null}
    </SettingsSection>
  );
}
