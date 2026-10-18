import type { CollectionItem } from '@esta/core/collections';
import type { CollectionRow } from '@/server/collections/load';

/**
 * The actions a collections row offers, in the order they show. P3-10, P3-11 and P3-13 add `Ghi nhận`, `Mã QR` and
 * `Nhắc qua Zalo` here; a viewer sees only the actions marked for viewers.
 */
export type CollectionRowAction = {
  readonly id: string;
  /** Its label in the `collections` messages. */
  readonly label: 'openLease';
  readonly forViewer: boolean;
  readonly href: (row: CollectionRow) => string;
  readonly appliesTo: (item: CollectionItem<CollectionRow>) => boolean;
};

export const COLLECTION_ROW_ACTIONS: readonly CollectionRowAction[] = [
  {
    id: 'open-lease',
    label: 'openLease',
    forViewer: true,
    href: (row) => `/properties/${row.propertyId}/rental/leases/${row.leaseId}`,
    appliesTo: () => true,
  },
];

export function collectionRowActions(item: CollectionItem<CollectionRow>, canEdit: boolean): readonly CollectionRowAction[] {
  return COLLECTION_ROW_ACTIONS.filter((action) => (canEdit || action.forViewer) && action.appliesTo(item));
}
