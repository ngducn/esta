import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { SectionKey } from './nav';

export async function sectionMetadata(section: Exclude<SectionKey, 'home'>): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav(section) };
}
