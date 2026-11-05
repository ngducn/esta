import { getTranslations } from 'next-intl/server';
import type { Refusals } from './settings-labels';

export async function memberRefusals(): Promise<Refusals> {
  const t = await getTranslations('settings.refusals');
  return {
    invalid: t('invalid'),
    lastAdmin: t('lastAdmin'),
    operator: t('operator'),
    alreadyMember: t('alreadyMember'),
    alreadyInvited: t('alreadyInvited'),
    notFound: t('notFound'),
    forbidden: t('forbidden'),
    failed: t('failed'),
  };
}
