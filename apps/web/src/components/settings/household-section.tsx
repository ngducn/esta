import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import type { Member } from '@/server/member';
import { HouseholdNameForm } from './household-name-form';
import { memberRefusals } from './member-refusals';
import { SettingsSection } from './settings-section';

export async function HouseholdSection({ member }: { member: Member }) {
  const t = await getTranslations('settings');
  const admin = member.role === 'admin';
  return (
    <SettingsSection id="household" title={t('household')} intro={admin ? t('householdIntro') : t('householdReadOnly')}>
      <Card className="flex flex-col gap-4">
        {admin ? (
          <HouseholdNameForm
            name={member.household.name}
            labels={{ name: t('householdName'), save: t('householdSave'), saving: t('saving'), refusals: await memberRefusals() }}
          />
        ) : (
          <p data-testid="household-name-text" className="text-headline font-semibold break-words">
            {member.household.name}
          </p>
        )}
        <p className="text-body-sm text-text-muted">{t('timezone', { zone: 'Asia/Ho_Chi_Minh' })}</p>
      </Card>
    </SettingsSection>
  );
}
