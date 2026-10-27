import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState, type EmptyStateAction } from '@/components/empty-state';
import type { SectionKey } from './nav';
import { sectionIcons } from './section-icons';

type LaterSection = Exclude<SectionKey, 'home' | 'settings' | 'properties' | 'collections' | 'documents' | 'reports' | 'diagnostics'>;

export async function sectionMetadata(section: Exclude<SectionKey, 'home'>): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav(section) };
}

/** Lane households already hold seeded data, so a placeholder says what arrives and never that the section is empty. */
export async function SectionPage({ section, action }: { section: LaterSection; action?: EmptyStateAction }) {
  const [nav, sections] = await Promise.all([getTranslations('nav'), getTranslations('sections')]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 break-words lg:text-h1">{nav(section)}</h1>
      <EmptyState icon={sectionIcons[section]} title={sections('soonTitle')} body={sections(section)} {...(action === undefined ? {} : { action })} className="max-w-3xl" />
    </div>
  );
}
