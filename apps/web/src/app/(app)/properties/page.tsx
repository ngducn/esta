import {
  PROPERTY_FILTER_KEYS,
  PROPERTY_SORT_KEYS,
  currentAddressText,
  parsePropertyFilters,
  propertyFiltersQuery,
  shortProvinceName,
  type PropertyFilterKey,
  type PropertyListRow,
  type SearchParamsRecord,
} from '@esta/core/properties';
import { compareVietnameseNames } from '@esta/core/names';
import { Archive, Plus } from 'lucide-react';
import Link from 'next/link';
import { formatVndCompact } from '@esta/core/format';
import { statusPills, statusWords } from '@/components/properties/status-pills';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { EmptyState } from '@/components/empty-state';
import { HeldDepositTotal } from '@/components/leases/HeldDepositTotal';
import { ArchivedNoticeLoader } from '@/components/properties/archived-notice-loader';
import { FilterChips, filterChips, hasChoice, type FilterChip, type FilterGroup } from '@/components/properties/filter-chips';
import type { PropertyCardData } from '@/components/properties/property-card';
import { ARCHIVED_PARAM } from '@/components/properties/property-form-values';
import { PropertyList } from '@/components/properties/property-list';
import { PropertySearch } from '@/components/properties/property-search';
import { SortSelect } from '@/components/properties/sort-select';
import { ViewToggle } from '@/components/properties/view-toggle';
import { sectionIcons } from '@/components/shell/section-icons';
import { sectionMetadata } from '@/components/shell/section-page';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { loadArchivedNickname } from '@/server/properties/form';
import { propertyIslandIntl } from '@/server/properties/island-messages';
import { listProperties } from '@/server/properties/list';
import { signCoverPhotos } from '@/server/properties/photos';
import MapView from './map-view';

export const generateMetadata = () => sectionMetadata('properties');

const comparable = (address: string) => address.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

const locateParam = z.uuid();

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const [params, member, clock] = await Promise.all([searchParams, requireMember(), getClock()]);
  const filters = parsePropertyFilters(params);
  const archivedId = locateParam.safeParse(params[ARCHIVED_PARAM]).data ?? null;
  const [list, nav, t, tc, locale, archived] = await Promise.all([
    listProperties(member.household.id, filters, clock.today()),
    getTranslations('nav'),
    getTranslations('properties'),
    getTranslations('components.completeness'),
    getLocale(),
    archivedId === null ? null : loadArchivedNickname(member.household.id, archivedId),
  ]);
  const canEdit = member.role !== 'viewer';
  const addAction = canEdit ? { label: t('add'), href: '/properties/new', icon: Plus } : undefined;
  const photos = await signCoverPhotos(member.id, list.rows.flatMap((row) => (row.coverPhotoPath === null ? [] : [row.coverPhotoPath])));

  const toCard = (row: PropertyListRow): PropertyCardData => {
    const address = currentAddressText(row) ?? '';
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
      rent: row.monthlyRentVnd === null ? null : { label: t('leaseRent'), amount: formatVndCompact(row.monthlyRentVnd, locale) },
      statuses: statusPills(list.statuses.get(row.id) ?? [], statusWords(t), locale),
      completeness: {
        percent: row.completeness.percent,
        label: tc('missing', { count: row.completeness.missing }),
        srLabel: tc('percent', { percent: row.completeness.percent }),
      },
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
    owner: (value) => list.ownerNames.get(value) ?? t('unknownOwner'),
  };
  const byName = (a: FilterChip, b: FilterChip) => compareVietnameseNames(a.label, b.label);
  const groups: FilterGroup[] = PROPERTY_FILTER_KEYS.map((key) => ({
    key,
    label: t('group', { group: key }),
    chips: filterChips(key, list.tallies[key], filters[key], valueLabel[key], t('all'), key === 'owner' ? byName : undefined),
  })).filter((group) => hasChoice(group, filters[group.key]));

  const cards = list.rows.map(toCard);
  const filtered = filters.q !== '' || PROPERTY_FILTER_KEYS.some((key) => filters[key] !== null);
  const count = filtered ? t('countFiltered', { shown: list.rows.length, count: list.householdCount }) : t('count', { count: list.householdCount });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h2 break-words lg:text-h1">{nav('properties')}</h1>
          <p data-testid="property-count" className="text-small text-ink-muted">
            {count}
          </p>
          <HeldDepositTotal householdId={member.household.id} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {list.householdCount === 0 ? null : (
            <ViewToggle filters={filters} label={t('view')} optionLabel={(view) => t('viewOption', { view })} />
          )}
          {addAction === undefined ? null : (
            <Link href={addAction.href} data-testid="add-property" className={buttonVariants({ variant: 'primary' })}>
              <Plus aria-hidden="true" />
              {addAction.label}
            </Link>
          )}
        </div>
      </header>
      {archivedId === null || archived === null ? null : <ArchivedPropertyToast id={archivedId} nickname={archived} />}

      {list.householdCount === 0 ? (
        <EmptyState
          icon={sectionIcons.properties}
          title={t('empty')}
          body={t('emptyBody')}
          className="max-w-3xl"
          {...(addAction === undefined ? {} : { action: addAction })}
        />
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
          ) : filters.view === 'map' ? (
            <MapView
              cards={cards}
              rows={list.rows}
              canEdit={canEdit}
              locate={locateParam.safeParse(params.locate).data ?? null}
              query={propertyFiltersQuery(filters)}
            />
          ) : (
            <PropertyList cards={cards} />
          )}
        </>
      )}
      <Link href="/properties/archived" className={cn(buttonVariants({ variant: 'quiet' }), 'self-start')}>
        <Archive aria-hidden="true" />
        {t('archivedLink')}
      </Link>
    </div>
  );
}


async function ArchivedPropertyToast({ id, nickname }: { id: string; nickname: string }) {
  const intl = await propertyIslandIntl();
  return <ArchivedNoticeLoader locale={intl.locale} messages={intl.messages} propertyId={id} nickname={nickname} />;
}
