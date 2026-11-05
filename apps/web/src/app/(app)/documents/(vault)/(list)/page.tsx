import { PageHeader } from '@/components/page-header';
import { SummaryStrip } from '@/components/summary-strip';
import { getTranslations } from 'next-intl/server';
import { DocumentVault } from '@/components/documents/document-vault';
import { sectionMetadata } from '@/components/shell/section-page';
import { loadVault, queryParam } from '@/server/documents/vault';
import { requireMember } from '@/server/member';

export const generateMetadata = () => sectionMetadata('documents');

/** Tài liệu opens on search (ux-daily-use rule 7, DESIGN-BRIEF §6.10). */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, member] = await Promise.all([searchParams, requireMember()]);
  const [vault, nav, t] = await Promise.all([loadVault(member.household.id, null, queryParam(params.q)), getTranslations('nav'), getTranslations('documents')]);

  const awaitingReview = Object.values(vault.statuses.statuses).filter((status) => status === 'needs_review').length;

  return (
    <div className="flex flex-col gap-stack">
      <PageHeader title={nav('documents')} meta={<p data-testid="document-count">{t('groupCount', { count: vault.tiles.length })}</p>} />
      {vault.tiles.length === 0 ? null : (
        <SummaryStrip
          label={t('stripLabel')}
          unknownLabel={t('figureTotal')}
          figures={[
            { label: t('figureTotal'), value: vault.tiles.length, sub: t('figureTotalSub'), testId: 'figure-total' },
            {
              label: t('figureExpiring'),
              value: vault.expiring.length,
              sub: vault.expiring.length === 0 ? t('figureExpiringNone') : t('figureExpiringSub'),
              testId: 'figure-expiring',
            },
            {
              label: t('figureReview'),
              value: awaitingReview,
              sub: awaitingReview === 0 ? t('figureReviewNone') : t('figureReviewSub'),
              testId: 'figure-review',
            },
          ]}
        />
      )}
      <DocumentVault scope={{ kind: 'household', householdId: member.household.id }} canEdit={member.role !== 'viewer'} {...vault} />
    </div>
  );
}
