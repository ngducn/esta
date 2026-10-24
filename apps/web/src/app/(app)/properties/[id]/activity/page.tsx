import { activityTime, describeActivity, type ActivityActor } from '@esta/core/activity';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ActivityList, type ActivityListEntry } from '@/components/properties/activity-list';
import { env } from '@/server/env';
import { loadPropertyActivity, loadPropertyDetail } from '@/server/properties/detail';
import { PropertyDetailFrame } from '../detail-frame';

export default async function PropertyActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const [t, rows] = await Promise.all([getTranslations('propertyDetail'), loadPropertyActivity(id)]);

  const actorLabel = (actor: ActivityActor) =>
    actor.kind === 'member' ? (actor.name ?? t('actor', { actor: 'member' })) : t('actor', { actor: actor.kind });

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
        b: (chunks) => <strong className="font-medium text-ink">{chunks}</strong>,
        when: (chunks) => (
          <time dateTime={row.at} className="text-ink-muted">
            {chunks}
          </time>
        ),
      }),
    };
  });

  return (
    <PropertyDetailFrame property={property} tab="activity">
      <ActivityList entries={entries} title={t('activityTitle')} empty={t('activityEmpty')} />
    </PropertyDetailFrame>
  );
}
