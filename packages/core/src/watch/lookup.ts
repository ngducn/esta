import type { WatchSnapshot } from './types';

/** The household's properties that are not archived. */
export const liveIds = ({ properties }: Pick<WatchSnapshot, 'properties'>): ReadonlySet<string> =>
  new Set(properties.flatMap((property) => (property.archived ? [] : [property.id])));
