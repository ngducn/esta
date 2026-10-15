import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { SectionKey } from './nav';

type LaterSection = Exclude<SectionKey, 'home'>;

export async function sectionMetadata(section: LaterSection): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav(section) };
}

/** A section that later phases fill. It names the section and says what arrives, never that it is empty. */
export async function SectionPage({ section }: { section: LaterSection }) {
  const [nav, sections] = await Promise.all([getTranslations('nav'), getTranslations('sections')]);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-h2 break-words lg:text-h1">{nav(section)}</h1>
      <p className="max-w-prose text-lead text-ink-muted">{sections(section)}</p>
    </div>
  );
}
