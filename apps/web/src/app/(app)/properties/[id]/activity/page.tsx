import { activityTime, describeActivity, type ActivityActor } from '@esta/core/activity';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { History } from 'lucide-react';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { ActivityList, type ActivityListEntry } from '@/components/properties/activity-list';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { loadPropertyActivity, loadPropertyDetail } from '@/server/properties/detail';
import { PropertyDetailFrame } from '../detail-frame';

export default async function PropertyActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const [t, rows, member] = await Promise.all([getTranslations('propertyDetail'), loadPropertyActivity(id), requireMember()]);

  const actorLabel = (actor: ActivityActor) =>
    'name' in actor ? (actor.name ?? t('actor', { actor: actor.kind })) : t('actor', { actor: actor.kind });

  const entries: ActivityListEntry[] = rows.map((row) => {
    const { actor, event, params: eventParams } = describeActivity(row);
    const { time, date } = activityTime(row.at, env.ESTA_TIMEZONE);
    return {
      id: row.id,
      event,
      line: t.rich('activityEntry', {
        actor: actorLabel(actor),
        event: t('event', { event, name: eventParams.name ?? '' }),
        time,
        date,
        b: (chunks) => <strong className="font-medium text-text">{chunks}</strong>,
        when: (chunks) => (
          <time dateTime={row.at} className="text-text-muted">
            {chunks}
          </time>
        ),
      }),
    };
  });

  return (
    <PropertyDetailFrame property={property} tab="activity">
      {entries.length === 0 ? (
        <RegistryEmptyState surface="propertyActivity" ctx={{ canWrite: member.can('edit'), propertyId: id }} icon={History} />
      ) : (
        <ActivityList entries={entries} title={t('activityTitle')} />
      )}
    </PropertyDetailFrame>
  );
}
