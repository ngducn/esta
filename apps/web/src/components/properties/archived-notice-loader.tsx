'use client';

import type { AbstractIntlMessages, Locale } from 'next-intl';
import dynamic from 'next/dynamic';

const ArchivedNotice = dynamic(() => import('./archived-notice'), { ssr: false });

/**
 * `Tài sản` renders this only right after an archive, so the toast, its intl provider and the restore action load then
 * and never weigh on the list's first paint.
 */
export function ArchivedNoticeLoader(props: { locale: Locale; messages: AbstractIntlMessages; propertyId: string; nickname: string }) {
  return <ArchivedNotice {...props} />;
}
