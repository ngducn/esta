import { CircleCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { MissingItems } from '@/components/completeness/missing-items';
import { CompletenessRingView } from '@/components/completeness-ring';
import { buttonVariants } from '@/components/ui/button-variants';
import { requireMember } from '@/server/member';
import { loadCompleteness } from '@/server/properties/completeness';

/** The finish step: the P1-03 score and every missing item, each opening its field through the check's anchor. */
export async function FinishChecklist({ propertyId, nickname }: { propertyId: string; nickname: string }) {
  const member = await requireMember();
  const [t, tc, scores] = await Promise.all([getTranslations('propertyWizard'), getTranslations('completeness'), loadCompleteness(member.household.id, propertyId)]);
  const score = scores.get(propertyId) ?? { percent: 100, failing: [] };
  return (
    <section data-testid="wizard-finish" aria-labelledby="wizard-finish-title" className="flex max-w-3xl flex-col gap-5 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-2">
        <h2 id="wizard-finish-title" className="flex items-start gap-2 text-lead font-bold text-ink">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-paid" strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0 break-words">{t('finishTitle', { nickname })}</span>
        </h2>
        <p className="max-w-prose text-body text-pretty text-ink-2">{t('finishBody')}</p>
      </div>
      <p data-testid="wizard-score" data-percent={score.percent} className="flex items-center gap-3 text-body font-semibold text-ink">
        {tc('title')}
        <CompletenessRingView percent={score.percent} label={tc('score', { percent: score.percent })} />
      </p>
      <MissingItems
        data={{
          listLabel: t('missingTitle'),
          complete: score.failing.length === 0 ? tc('complete') : null,
          items: score.failing.map((item) => ({ id: item.id, label: tc(`checks.${item.id}`), href: item.href })),
        }}
      />
      <div className="flex flex-wrap gap-3">
        <Link href={`/properties/${propertyId}`} data-testid="wizard-open-property" className={buttonVariants({ variant: 'primary' })}>
          {t('openProperty')}
        </Link>
        <Link href="/properties/new" className={buttonVariants({ variant: 'outline' })}>
          {t('addAnother')}
        </Link>
      </div>
    </section>
  );
}
