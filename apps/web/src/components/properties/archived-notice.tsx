'use client';

import type { AbstractIntlMessages, Locale } from 'next-intl';
import { ArchivedUndo } from './archive-button';
import { PropertyIntl } from './property-intl';

export default function ArchivedNotice({
  locale,
  messages,
  propertyId,
  nickname,
}: {
  locale: Locale;
  messages: AbstractIntlMessages;
  propertyId: string;
  nickname: string;
}) {
  return (
    <PropertyIntl locale={locale} messages={messages}>
      <ArchivedUndo propertyId={propertyId} nickname={nickname} />
    </PropertyIntl>
  );
}
