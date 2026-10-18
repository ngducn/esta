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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 break-words lg:text-h1">{nav('documents')}</h1>
        <p data-testid="document-count" className="text-small text-ink-muted">
          {t('groupCount', { count: vault.tiles.length })}
        </p>
      </header>
      <DocumentVault scope={{ kind: 'household', householdId: member.household.id }} canEdit={member.role !== 'viewer'} {...vault} />
    </div>
  );
}
