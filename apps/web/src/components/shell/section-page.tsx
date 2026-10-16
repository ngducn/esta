import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { StaticImageData } from 'next/image';
import { EmptyState } from '@/components/empty-state';
import { Photo } from '@/components/photo';
import canHo from '@/photos/can-ho.webp';
import dat from '@/photos/dat.webp';
import dayTro from '@/photos/day-tro.webp';
import nhaPho from '@/photos/nha-pho.webp';
import type { SectionKey } from './nav';
import { sectionIcons } from './section-icons';

type LaterSection = Exclude<SectionKey, 'home' | 'settings'>;

export async function sectionMetadata(section: Exclude<SectionKey, 'home'>): Promise<Metadata> {
  const nav = await getTranslations('nav');
  return { title: nav(section) };
}

const collage = [
  { photo: nhaPho, label: 'nhaPho' },
  { photo: dayTro, label: 'dayTro' },
  { photo: canHo, label: 'canHo' },
  { photo: dat, label: 'dat' },
] as const satisfies readonly { photo: StaticImageData; label: string }[];

/** Demo photos of the kinds of place Esta will hold, labelled as illustrations so nothing reads as real data. */
async function PropertyCollage() {
  const [photos, sections] = await Promise.all([getTranslations('photos'), getTranslations('sections')]);
  return (
    <figure className="flex flex-col gap-2 p-2 pb-0">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {collage.map(({ photo, label }) => (
          <div key={label} className="relative aspect-[4/3] overflow-hidden rounded-md bg-surface-2">
            <Photo src={photo} alt="" sizes="(min-width: 1024px) 15rem, (min-width: 640px) 25vw, 50vw" className="object-cover" />
            <span className="absolute top-2 left-2 rounded-full bg-surface px-2.5 py-1 text-small font-semibold text-ink">{photos(label)}</span>
          </div>
        ))}
      </div>
      <figcaption className="px-3 text-small text-ink-muted">{sections('photoCaption')}</figcaption>
    </figure>
  );
}

/** Lane households already hold seeded data, so a placeholder says what arrives and never that the section is empty. */
export async function SectionPage({ section }: { section: LaterSection }) {
  const [nav, sections] = await Promise.all([getTranslations('nav'), getTranslations('sections')]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 break-words lg:text-h1">{nav(section)}</h1>
      <EmptyState
        icon={sectionIcons[section]}
        title={sections('soonTitle')}
        body={sections(section)}
        media={section === 'properties' ? <PropertyCollage /> : undefined}
        className="max-w-3xl"
      />
    </div>
  );
}
