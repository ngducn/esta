import type { ReactNode } from 'react';
import { deleteLegalItem, restoreLegalItem } from '@/app/(app)/properties/[id]/legal/actions';
import { ItemActions } from '@/components/item-actions';
import type { LegalKind } from '@esta/ops';
import { itemActionLabels } from './item-labels';

export async function LegalCard({
  propertyId,
  kind,
  itemId,
  name,
  canEdit,
  title,
  children,
}: {
  propertyId: string;
  kind: LegalKind;
  itemId: string;
  name: string;
  canEdit: boolean;
  title: ReactNode;
  children: ReactNode;
}) {
  const labels = canEdit ? await itemActionLabels(kind, name) : null;
  return (
    <li data-testid={`${kind}-card`} data-id={itemId} className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 text-lead font-semibold break-words text-ink">{title}</h3>
        {labels === null ? null : (
          <ItemActions
            editHref={`/properties/${propertyId}/legal/${kind}/${itemId}`}
            remove={deleteLegalItem.bind(null, propertyId, kind, itemId)}
            restore={restoreLegalItem}
            labels={labels}
          />
        )}
      </div>
      {children}
    </li>
  );
}
