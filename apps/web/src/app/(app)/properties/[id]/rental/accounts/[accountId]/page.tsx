import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { UtilityAccountForm } from '@/components/rental/utility-account-form';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { loadPropertyRental, loadUtilityAccount } from '@/server/properties/rental';

const paramsSchema = z.object({ id: z.uuid(), accountId: z.union([z.literal('new'), z.uuid()]) });

type Params = Promise<{ id: string; accountId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  const t = await getTranslations('propertyRental');
  if (!parsed.success) return {};
  return { title: parsed.data.accountId === 'new' ? t('newAccountTitle') : t('editAccountTitle') };
}

/** Six fields, so a full page rather than a sheet (DESIGN-BRIEF §5.3). */
export default async function UtilityAccountPage({ params }: { params: Params }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id, accountId } = parsed.data;
  const [member, property] = await Promise.all([requireMember(), loadPropertyDetail(id)]);
  if (member.role === 'viewer' || property === null) notFound();
  const editing = accountId === 'new' ? null : accountId;
  const [account, rental, t, locale, messages] = await Promise.all([
    editing === null ? null : loadUtilityAccount(id, editing),
    loadPropertyRental(id),
    getTranslations('propertyRental'),
    getLocale(),
    getMessages(),
  ]);
  if (editing !== null && account === null) notFound();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/properties/${id}/rental`} label={property.nickname} />
      <h1 className="text-h2 break-words text-balance lg:text-h1">{editing === null ? t('newAccountTitle') : t('editAccountTitle')}</h1>
      <PropertyIntl locale={locale} messages={{ propertyRental: messages.propertyRental }}>
        <UtilityAccountForm
          propertyId={id}
          accountId={editing}
          initial={account}
          units={rental.units.map((unit) => ({ id: unit.id, label: unit.label }))}
        />
      </PropertyIntl>
    </div>
  );
}
