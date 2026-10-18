import 'server-only';
import { isDocumentCategory, thumbBlurPath, thumbPath, type DocumentCategory } from '@esta/core/documents';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { env } from '@/server/env';
import { createSessionClient } from '@/server/supabase/server';
import { signDocumentUrls } from './sign';

export type DocumentListItem = {
  readonly id: string;
  readonly category: DocumentCategory;
  readonly title: string;
  readonly sensitive: boolean;
  readonly expiresOn: IsoDate | null;
  /** `thumb-blur.webp` for a sensitive document, so the clear image never reaches the browser before `Xem` (DOC-5). */
  readonly thumbUrl: string | null;
};

/** The live documents of a property, newest first, each with one signed thumbnail URL. */
export async function listDocuments(householdId: string, propertyId: string): Promise<DocumentListItem[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id, category, title, sensitivity, expires_on')
    .eq('household_id', householdId)
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id');
  if (error) throw new Error(`Reading documents failed: ${error.message}`);
  const rows = data.flatMap((row) => (isDocumentCategory(row.category) ? [{ ...row, category: row.category }] : []));
  const thumbOf = (row: (typeof rows)[number]) =>
    row.sensitivity === 'sensitive' ? thumbBlurPath(householdId, row.id) : thumbPath(householdId, row.id);
  const urls = await signDocumentUrls(rows.map(thumbOf), env.ESTA_SIGNED_URL_TTL_SECONDS);
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    sensitive: row.sensitivity === 'sensitive',
    expiresOn: row.expires_on !== null && isIsoDate(row.expires_on) ? row.expires_on : null,
    thumbUrl: urls.get(thumbOf(row)) ?? null,
  }));
}
