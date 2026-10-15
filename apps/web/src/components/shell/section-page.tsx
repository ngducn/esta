import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { SectionKey } from './nav';

type LaterSection = Exclude<SectionKey, 'home'>;

export async function sectionMetadata(section: LaterSection): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav(section) };
}

/** Lane households already hold seeded data, so a placeholder says what arrives and never that the section is empty. */
export async function SectionPage({ section }: { section: LaterSection }) {
  const [nav, sections] = await Promise.all([getTranslations('nav'), getTranslations('sections')]);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-h2 break-words lg:text-h1">{nav(section)}</h1>
      <p className="max-w-prose text-lead text-ink-muted">{sections(section)}</p>
    </div>
  );
}
