import type { CollectionItem } from '@esta/core/collections';
import type { CollectionRow } from '@/server/collections/load';

type ActionBase = {
  readonly id: string;
  readonly forViewer: boolean;
  readonly appliesTo: (item: CollectionItem<CollectionRow>) => boolean;
};

/**
 * The actions a collections row offers, in the order they show. P3-11 and P3-13 add `Mã QR` and `Nhắc qua Zalo` here;
 * a viewer sees only the actions marked for viewers. A link navigates; `recordPayment` opens the sheet on the row.
 * Each label is a key in the `collections` messages.
 */
export type CollectionRowAction =
  | (ActionBase & { readonly kind: 'recordPayment'; readonly label: 'recordPayment' })
  | (ActionBase & { readonly kind: 'link'; readonly label: 'openLease'; readonly href: (row: CollectionRow) => string });

export const COLLECTION_ROW_ACTIONS: readonly CollectionRowAction[] = [
  {
    id: 'record-payment',
    kind: 'recordPayment',
    label: 'recordPayment',
    forViewer: false,
    appliesTo: (item) => item.row.outstandingVnd > 0,
  },
  {
    id: 'open-lease',
    kind: 'link',
    label: 'openLease',
    forViewer: true,
    href: (row) => `/properties/${row.propertyId}/rental/leases/${row.leaseId}`,
    appliesTo: () => true,
  },
];

export function collectionRowActions(item: CollectionItem<CollectionRow>, canEdit: boolean): readonly CollectionRowAction[] {
  return COLLECTION_ROW_ACTIONS.filter((action) => (canEdit || action.forViewer) && action.appliesTo(item));
}
