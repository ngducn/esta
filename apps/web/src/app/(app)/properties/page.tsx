import { PageHeader } from '@/components/page-header';
import {
  PROPERTY_FILTER_KEYS,
  PROPERTY_SORT_KEYS,
  PROPERTY_STATUS_FILTERS,
  byUrgency,
  currentAddressText,
  emptyListKind,
  parsePropertyFilters,
  propertyFiltersQuery,
  shortProvinceName,
  type PropertyFilterKey,
  type PropertyListRow,
  type SearchParamsRecord,
} from '@esta/core/properties';
import { sameAddress } from '@esta/core/address';
import { compareVietnameseNames } from '@esta/core/names';
import { Archive, CircleCheck, Plus, SearchX } from 'lucide-react';
import Link from 'next/link';
import { formatVnd } from '@esta/core/format';
import { statusPills, statusWords } from '@/components/properties/status-pills';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { EmptyState } from '@/components/empty-state';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { FilterTabs } from '@/components/filter-tabs';
import { MoneyDisplay } from '@/components/money/money-display';
import { SummaryStrip } from '@/components/summary-strip';
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
  const canEdit = member.can('edit');
  const addAction = canEdit ? { label: t('add'), href: '/properties/new', icon: Plus } : undefined;
  const photos = await signCoverPhotos(member.id, list.rows.flatMap((row) => (row.coverPhotoPath === null ? [] : [row.coverPhotoPath])));

  const toCard = (row: PropertyListRow): PropertyCardData => {
    const address = currentAddressText(row) ?? '';
    const certificate = row.certificateAddressText;
    const marks = [...(list.statuses.get(row.id) ?? [])].sort(byUrgency);
    return {
      id: row.id,
      nickname: row.nickname,
      kind: row.kind,
      kindLabel: t('kind', { kind: row.kind }),
      address: address === '' ? t('noAddress') : address,
      certificateLine:
        certificate === null || sameAddress(certificate, address) ? null : t('certificateAddress', { address: certificate }),
      photoUrl: row.coverPhotoPath === null ? null : (photos.get(row.coverPhotoPath) ?? null),
      addPhoto: canEdit ? { href: `/properties/${row.id}/edit`, label: t('addPhoto') } : null,
      rent: row.monthlyRentVnd === null ? null : { amount: formatVnd(row.monthlyRentVnd, locale), per: t('perMonth') },
      noContract: t('noContract'),
      statuses: statusPills(marks, statusWords(t), locale),
      rooms: row.unitCount > 1 ? t('rooms', { total: row.unitCount, free: Math.max(0, row.unitCount - row.leasedUnitCount) }) : null,
      completeness: {
        percent: row.completeness.percent,
        label: row.completeness.percent === 0 ? tc('empty') : tc('missing', { count: row.completeness.missing }),
        srLabel: tc('percent', { percent: row.completeness.percent }),
      },
    };
  };

  const chipKeys = PROPERTY_FILTER_KEYS.filter((key): key is Exclude<PropertyFilterKey, 'status'> => key !== 'status');
  const valueLabel: Record<(typeof chipKeys)[number], (value: string) => string> = {
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
  const groups: FilterGroup[] = chipKeys
    .map((key) => ({
      key,
      label: t('group', { group: key }),
      chips: filterChips(key, list.tallies[key], filters[key], valueLabel[key], t('all'), key === 'owner' ? byName : undefined),
    }))
    .filter((group) => hasChoice(group, filters[group.key]));

  const statusTab = (key: string, status: (typeof PROPERTY_STATUS_FILTERS)[number] | null) => ({
    key,
    label: status === null ? t('all') : t('statusOption', { status }),
    count: status === null ? list.tallies.status.all : status === 'attention' && list.totals.attention === null ? null : (list.tallies.status.values.get(status) ?? 0),
    href: `/properties${propertyFiltersQuery({ ...filters, status })}`,
    current: filters.status === status,
  });
  const statusTabs = [statusTab('all', null), ...PROPERTY_STATUS_FILTERS.map((status) => statusTab(status, status))];

  const cards = list.rows.map(toCard);
  const filtered = filters.q !== '' || PROPERTY_FILTER_KEYS.some((key) => filters[key] !== null);
  const count = filtered ? t('countFiltered', { shown: list.rows.length, count: list.householdCount }) : t('count', { count: list.householdCount });
  const { totals } = list;
  const emptyKind = emptyListKind(filters, totals.attention);
  const clearAction = { label: t('clearFilters'), href: '/properties' };

  return (
    <div className="flex flex-col gap-stack">
      <PageHeader
        title={nav('properties')}
        meta={
          <>
            <p data-testid="property-count">{count}</p>
            <HeldDepositTotal householdId={member.household.id} />
          </>
        }
        actions={
          addAction === undefined || list.householdCount === 0 ? undefined : (
            <Link href={addAction.href} data-testid="add-property" className={buttonVariants({ variant: 'primary' })}>
              <Plus aria-hidden="true" />
              {addAction.label}
            </Link>
          )
        }
      />
      {archivedId === null || archived === null ? null : <ArchivedPropertyToast id={archivedId} nickname={archived} />}

      {list.householdCount === 0 ? (
        <RegistryEmptyState surface="properties" ctx={{ canWrite: canEdit }} icon={sectionIcons.properties} className="max-w-3xl" />
      ) : (
        <>
          <SummaryStrip
            label={t('stripLabel')}
            unknownLabel={t('unknownFigure')}
            figures={[
              {
                label: t('figureAttention'),
                value: totals.attention === null ? null : t('figureAttentionValue', { count: totals.attention }),
                sub: totals.attention === null ? t('figureAttentionUnknown') : totals.attention === 0 ? t('figureAttentionNone') : t('figureAttentionSub'),
              },
              {
                label: t('figureLeased'),
                value: totals.units === 0 ? null : t('figureLeasedValue', { leased: totals.leasedUnits, total: totals.units }),
                sub: t('figureLeasedSub'),
              },
              {
                label: t('figureRent'),
                value: totals.rentVnd === null ? null : <MoneyDisplay amount={totals.rentVnd} className="text-start" />,
                sub: totals.rentVnd === null ? t('figureRentNone') : t('figureRentSub'),
              },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
            <FilterTabs label={t('statusLabel')} tabs={statusTabs} />
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
            <ViewToggle filters={filters} label={t('view')} optionLabel={(view) => t('viewOption', { view })} />
          </div>
          {list.rows.length === 0 ? (
            emptyKind === 'search' ? (
              <EmptyState
                icon={SearchX}
                title={t('noMatch', { query: filters.q })}
                body={t('noMatchBody')}
                className="max-w-3xl"
                action={clearAction}
              />
            ) : emptyKind === 'allClear' ? (
              <EmptyState
                icon={CircleCheck}
                tone="good"
                title={t('noAttention')}
                className="max-w-3xl"
                action={{ label: t('showAll'), href: '/properties' }}
              />
            ) : (
              <EmptyState icon={SearchX} title={t('noMatchFilters')} className="max-w-3xl" action={clearAction} />
            )
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
      <Link href="/properties/archived" className={cn(buttonVariants({ variant: 'ghost' }), 'self-start')}>
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
