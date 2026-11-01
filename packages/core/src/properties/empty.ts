import { PROPERTY_FILTER_KEYS, type PropertyFilters } from './filters';

export type EmptyListKind = 'search' | 'allClear' | 'filters';

export function emptyListKind(filters: PropertyFilters, attention: number | null): EmptyListKind {
  if (filters.q !== '') return 'search';
  const onlyAttention = PROPERTY_FILTER_KEYS.every((key) => (key === 'status' ? filters[key] === 'attention' : filters[key] === null));
  return onlyAttention && attention !== null ? 'allClear' : 'filters';
}
