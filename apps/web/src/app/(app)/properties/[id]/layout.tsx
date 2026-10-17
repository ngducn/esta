import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { loadPropertyDetail } from '@/server/properties/detail';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [property, t] = await Promise.all([loadPropertyDetail(id), getTranslations('propertyDetail')]);
  return { title: property?.nickname ?? t('notFoundTitle') };
}

export default function PropertyDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
