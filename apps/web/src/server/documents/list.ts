import 'server-only';
import { documentExpiry, isDocumentCategory, thumbPath, type DocumentCategory } from '@esta/core/documents';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { getTranslations } from 'next-intl/server';
import { env } from '@/server/env';
import { createSessionClient } from '@/server/supabase/server';
import { signDocumentUrls } from './sign';

export type DocumentListItem = {
  readonly id: string;
  readonly category: DocumentCategory;
  readonly title: string;
  readonly expiresOn: IsoDate | null;
  readonly propertyId: string | null;
  readonly propertyName: string | null;
  readonly thumbUrl: string | null;
};

export const DOCUMENT_LIST_COLUMNS = 'id, category, title, expires_on, property_id, properties(nickname)';

export type DocumentListRow = {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly expires_on: string | null;
  readonly property_id: string | null;
  readonly properties: { readonly nickname: string } | null;
};

/** Signs one thumbnail per row on the member's session and drops a row whose category this build does not know. */
export async function toListItems(householdId: string, data: readonly DocumentListRow[]): Promise<DocumentListItem[]> {
  const rows = data.flatMap((row) => (isDocumentCategory(row.category) ? [{ ...row, category: row.category }] : []));
  const thumbOf = (row: (typeof rows)[number]) => thumbPath(householdId, row.id);
  const urls = await signDocumentUrls(rows.map(thumbOf), env.ESTA_SIGNED_URL_TTL_SECONDS, { appOrigin: true });
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    expiresOn: row.expires_on !== null && isIsoDate(row.expires_on) ? row.expires_on : null,
    propertyId: row.property_id,
    propertyName: row.properties?.nickname ?? null,
    thumbUrl: urls.get(thumbOf(row)) ?? null,
  }));
}

/** The live documents of the household, or of one property, newest first, each with one signed thumbnail URL. */
export async function listDocuments(householdId: string, propertyId: string | null = null): Promise<DocumentListItem[]> {
  const supabase = await createSessionClient();
  let query = supabase.from('documents').select(DOCUMENT_LIST_COLUMNS).eq('household_id', householdId).is('deleted_at', null);
  if (propertyId !== null) query = query.eq('property_id', propertyId);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id');
  if (error) throw new Error(`Reading documents failed: ${error.message}`);
  return toListItems(householdId, data);
}

export type VaultTile = {
  readonly id: string;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly categoryLabel: string;
  readonly propertyId: string | null;
  readonly propertyName: string | null;
  readonly expiry: { readonly text: string; readonly expired: boolean } | null;
  readonly thumbUrl: string | null;
};

/** What a tile prints: the category in words and the expiry line within the 30-day window. */
export async function vaultTiles(items: readonly DocumentListItem[], today: IsoDate): Promise<VaultTile[]> {
  const t = await getTranslations('documents');
  return items.map((item) => {
    const expiry = documentExpiry(item.expiresOn, today);
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      categoryLabel: t('category', { category: item.category }),
      propertyId: item.propertyId,
      propertyName: item.propertyName,
      thumbUrl: item.thumbUrl,
      expiry:
        expiry.state === 'none'
          ? null
          : expiry.state === 'expired'
            ? { text: t('expired'), expired: true }
            : { text: t('expiry', { days: expiry.days }), expired: false },
    };
  });
}
