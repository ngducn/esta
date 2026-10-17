import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { LegalKind } from '@/server/properties/legal';
import type { LegalItemActionLabels } from './legal-item-actions';

export async function itemActionLabels(kind: LegalKind, name: string): Promise<LegalItemActionLabels> {
  const t = await getTranslations('propertyLegal');
  const item = t('itemName', { kind, name });
  return {
    edit: t('edit'),
    editLabel: t('editLabel', { item }),
    delete: t('delete'),
    deleteLabel: t('deleteLabel', { item }),
    deleting: t('deleting'),
    deleted: t('deleted', { item }),
    deleteFailed: t('deleteFailed'),
    restoreFailed: t('restoreFailed'),
  };
}
