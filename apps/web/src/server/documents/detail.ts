import 'server-only';
import { documentExpiry, isDocumentCategory, thumbPath, type DocumentCategory } from '@esta/core/documents';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { openDocument } from './actions';
import type { DocumentStatuses } from './extraction-status';
import { signDocumentUrl } from './sign';
import { readDocumentStatuses } from './status';

export type DocumentDetail = {
  readonly id: string;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly categoryLabel: string;
  readonly mime: string;
  readonly pageCount: number;
  readonly propertyId: string | null;
  readonly propertyName: string | null;
  readonly expiresOn: IsoDate | null;
  /** The expiry in words: the countdown inside 30 days, `Đã hết hạn` after, the date otherwise. */
  readonly expiryText: string | null;
  readonly expiringSoon: boolean;
  readonly tags: readonly string[];
  readonly sensitive: boolean;
};

export type DocumentPageData = {
  readonly document: DocumentDetail;
  /** Signed for this render, which logs one view (DOC-4); null when Storage refused it. */
  readonly fileUrl: string | null;
  readonly thumbUrl: string | null;
  readonly statuses: DocumentStatuses;
  readonly canEdit: boolean;
  readonly properties: readonly { readonly id: string; readonly nickname: string }[];
};

/** One live document under the member's RLS; another household's, or an archived one, reads as absent. */
export async function loadDocumentPage(documentId: string): Promise<DocumentPageData | null> {
  if (!z.uuid().safeParse(documentId).success) return null;
  const member = await requireMember();
  const supabase = await createSessionClient();
  const { data: row } = await supabase
    .from('documents')
    .select('id, title, category, mime, page_count, property_id, expires_on, tags, sensitivity, properties(nickname)')
    .eq('household_id', member.household.id)
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (row === null || !isDocumentCategory(row.category)) return null;
  const [fileUrl, thumbUrl, statuses, properties, clock, t, locale] = await Promise.all([
    openDocument(documentId, 'view'),
    signDocumentUrl(thumbPath(member.household.id, documentId), env.ESTA_SIGNED_URL_TTL_SECONDS),
    readDocumentStatuses(documentId, 'document'),
    supabase.from('properties').select('id, nickname').eq('household_id', member.household.id).is('deleted_at', null).order('nickname'),
    getClock(),
    getTranslations('documents'),
    getLocale(),
  ]);
  const expiresOn = row.expires_on !== null && isIsoDate(row.expires_on) ? row.expires_on : null;
  const expiry = documentExpiry(expiresOn, clock.today());
  const expiryText =
    expiry.state === 'expires_in'
      ? t('expiry', { days: expiry.days })
      : expiry.state === 'expired'
        ? t('expired')
        : expiresOn === null
          ? null
          : t('expiresOn', { date: formatDate(expiresOn, locale === 'en' ? 'en' : 'vi') });
  return {
    document: {
      id: row.id,
      title: row.title,
      category: row.category,
      categoryLabel: t('category', { category: row.category }),
      mime: row.mime,
      pageCount: row.page_count ?? 1,
      propertyId: row.property_id,
      propertyName: row.properties?.nickname ?? null,
      expiresOn,
      expiryText,
      expiringSoon: expiry.state !== 'none',
      tags: row.tags,
      sensitive: row.sensitivity === 'sensitive',
    },
    fileUrl,
    thumbUrl,
    statuses: statuses ?? { statuses: {}, workerOffline: false },
    canEdit: member.role !== 'viewer',
    properties: properties.data ?? [],
  };
}
