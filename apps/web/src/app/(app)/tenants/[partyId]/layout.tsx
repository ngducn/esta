import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireMember } from '@/server/member';
import { loadTenantPage } from '@/server/tenants/load';

/** Resolving the person here, above the page's loading boundary, is what makes a hidden person answer a real 404 and not a 200 that says not found. */
export async function generateMetadata({ params }: { params: Promise<{ partyId: string }> }): Promise<Metadata> {
  const member = await requireMember();
  if (!member.can('tenants')) notFound();
  const [{ partyId }, t] = await Promise.all([params, getTranslations('tenants')]);
  if ((await loadTenantPage(partyId)) === null) notFound();
  return { title: t('meta') };
}

export default function TenantLayout({ children }: { children: ReactNode }) {
  return children;
}
