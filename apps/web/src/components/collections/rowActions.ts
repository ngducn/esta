import type { CollectionItem } from '@esta/core/collections';
import type { CollectionRow } from '@/server/collections/load';

type ActionBase = {
  readonly id: string;
  readonly forViewer: boolean;
  readonly appliesTo: (item: CollectionItem<CollectionRow>) => boolean;
};

/**
 * The actions a collections row offers, in the order they show; a viewer sees only the actions marked for viewers. A
 * link navigates; `recordPayment`, `qr` and `remind` open their sheet on the row. Each label is a key in the
 * `collections` messages.
 */
export type CollectionRowAction =
  | (ActionBase & { readonly kind: 'recordPayment'; readonly label: 'recordPayment' })
  | (ActionBase & { readonly kind: 'qr'; readonly label: 'qr' })
  | (ActionBase & { readonly kind: 'remind'; readonly label: 'remind' })
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
    id: 'qr',
    kind: 'qr',
    label: 'qr',
    forViewer: true,
    appliesTo: (item) => item.row.outstandingVnd > 0,
  },
  {
    id: 'remind',
    kind: 'remind',
    label: 'remind',
    forViewer: false,
    appliesTo: (item) => item.row.outstandingVnd > 0 && item.row.tenantName !== null,
  },
  {
    id: 'open-lease',
    kind: 'link',
    label: 'openLease',
    forViewer: true,
    href: (row) => `/properties/${row.propertyId}/rental/leases/${row.leaseId}`,
    appliesTo: (item) => !item.row.propertyArchived,
  },
];

export function collectionRowActions(item: CollectionItem<CollectionRow>, canEdit: boolean): readonly CollectionRowAction[] {
  return COLLECTION_ROW_ACTIONS.filter((action) => (canEdit || action.forViewer) && action.appliesTo(item));
}
