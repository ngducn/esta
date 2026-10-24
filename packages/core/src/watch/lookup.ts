import type { WatchSnapshot } from './types';

export const liveIds = ({ properties }: Pick<WatchSnapshot, 'properties'>): ReadonlySet<string> =>
  new Set(properties.flatMap((property) => (property.archived ? [] : [property.id])));
