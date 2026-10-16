import {
  PROPERTY_FILTER_KEYS,
  PROPERTY_SORT_KEYS,
  parsePropertyFilters,
  shortProvinceName,
  type PropertyFilterKey,
  type PropertyListRow,
  type SearchParamsRecord,
} from '@esta/core/properties';
import Link from 'next/link';
import { preload } from 'react-dom';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { FilterChips, filterChips, hasChoice, type FilterGroup } from '@/components/properties/filter-chips';
import type { PropertyCardData } from '@/components/properties/property-card';
import { PropertyList } from '@/components/properties/property-list';
import { PropertySearch } from '@/components/properties/property-search';
import { SortSelect } from '@/components/properties/sort-select';
import { sectionIcons } from '@/components/shell/section-icons';
import { sectionMetadata } from '@/components/shell/section-page';
import { buttonVariants } from '@/components/ui/button';
import { listProperties } from '@/server/properties/list';
import { signCoverPhotos } from '@/server/properties/photos';

export const generateMetadata = () => sectionMetadata('properties');

const comparable = (address: string) => address.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const filters = parsePropertyFilters(await searchParams);
  const [list, nav, t] = await Promise.all([listProperties(filters), getTranslations('nav'), getTranslations('properties')]);
  const photos = await signCoverPhotos(list.rows.flatMap((row) => (row.coverPhotoPath === null ? [] : [row.coverPhotoPath])));

  const toCard = (row: PropertyListRow): PropertyCardData => {
    const address = [row.addressLine, row.communeName, row.provinceName === null ? null : shortProvinceName(row.provinceName)]
      .filter((part): part is string => part !== null && part !== '')
      .join(', ');
    const certificate = row.certificateAddressText;
    return {
      id: row.id,
      nickname: row.nickname,
      kind: row.kind,
      kindLabel: t('kind', { kind: row.kind }),
      useMode: row.useMode,
      useLabel: t('use', { use: row.useMode }),
      legalStatus: row.legalStatus,
      legalLabel: t('legal', { legal: row.legalStatus }),
      address: address === '' ? t('noAddress') : address,
      certificateLine:
        certificate === null || comparable(certificate) === comparable(address) ? null : t('certificateAddress', { address: certificate }),
      photoUrl: row.coverPhotoPath === null ? null : (photos.get(row.coverPhotoPath) ?? null),
    };
  };

  const valueLabel: Record<PropertyFilterKey, (value: string) => string> = {
    province: (value) => {
      const current = list.provinceNames.get(value);
      if (current !== undefined) return shortProvinceName(current);
      return /^[0-9]{2}$/.test(value) ? value : t('legacyProvince', { name: shortProvinceName(value) });
    },
    kind: (value) => t('kind', { kind: value }),
    use: (value) => t('use', { use: value }),
    legal: (value) => t('legal', { legal: value }),
  };
  const groups: FilterGroup[] = PROPERTY_FILTER_KEYS.map((key) => ({
    key,
    label: t('group', { group: key }),
    chips: filterChips(key, list.tallies[key], filters[key], valueLabel[key], t('all')),
  })).filter((group) => hasChoice(group, filters[group.key]));

  const cards = list.rows.map(toCard);
  const lcpPhoto = cards[0]?.photoUrl;
  if (lcpPhoto) preload(lcpPhoto, { as: 'image', fetchPriority: 'high' });

  const filtered = filters.q !== '' || PROPERTY_FILTER_KEYS.some((key) => filters[key] !== null);
  const count = filtered ? t('countFiltered', { shown: list.rows.length, count: list.householdCount }) : t('count', { count: list.householdCount });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 break-words lg:text-h1">{nav('properties')}</h1>
        <p data-testid="property-count" className="text-small text-ink-muted">
          {count}
        </p>
      </header>

      {list.householdCount === 0 ? (
        <EmptyState icon={sectionIcons.properties} title={t('empty')} body={t('emptyBody')} className="max-w-3xl" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <PropertySearch label={t('searchLabel')} placeholder={t('searchPlaceholder')} />
            <FilterChips
              groups={groups}
              filters={filters}
              labels={{ open: t('filters'), title: t('filtersTitle'), done: t('showResults', { count: list.rows.length }) }}
            />
            <SortSelect
              label={t('sort')}
              value={filters.sort}
              options={PROPERTY_SORT_KEYS.map((sort) => ({ value: sort, label: t('sortOption', { sort }) }))}
            />
          </div>
          {list.rows.length === 0 ? (
            <section className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card">
              <p className="text-body text-ink">{filters.q === '' ? t('noMatchFilters') : t('noMatch', { query: filters.q })}</p>
              <Link href="/properties" className={buttonVariants({ variant: 'outline' })}>
                {t('clearFilters')}
              </Link>
            </section>
          ) : (
            <PropertyList cards={cards} />
          )}
        </>
      )}
    </div>
  );
}
