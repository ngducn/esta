import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CertificateForm } from '@/components/legal/certificate-form';
import { ParcelForm, type CertificateOption } from '@/components/legal/parcel-form';
import { StructureForm } from '@/components/legal/structure-form';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { legalKindSchema, loadLandUseCodes, type LegalKind, loadLegalItem, loadParties, loadPropertyLegal } from '@/server/properties/legal';

const paramsSchema = z.object({ id: z.uuid(), kind: legalKindSchema, itemId: z.union([z.literal('new'), z.uuid()]) });

type Params = Promise<{ id: string; kind: string; itemId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const parsed = paramsSchema.safeParse(await params);
  const t = await getTranslations('propertyLegal');
  if (!parsed.success) return {};
  return { title: parsed.data.itemId === 'new' ? t('newTitle', { kind: parsed.data.kind }) : t('editTitle', { kind: parsed.data.kind }) };
}

/** Each legal form has more than five fields, so it is a full page rather than a sheet (DESIGN-BRIEF §5.3). */
export default async function LegalItemPage({ params }: { params: Params }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { id, kind, itemId } = parsed.data;
  const [member, property] = await Promise.all([requireMember(), loadPropertyDetail(id)]);
  if (member.role === 'viewer' || property === null) notFound();
  const editing = itemId === 'new' ? null : itemId;
  const load = async <K extends LegalKind>(of: K) => (editing === null ? null : loadLegalItem(of, id, editing));
  const [loaded, legal, parties, codes, t, locale, messages] = await Promise.all([
    kind === 'parcels'
      ? load('parcels').then((item) => ({ kind: 'parcels' as const, item }))
      : kind === 'structures'
        ? load('structures').then((item) => ({ kind: 'structures' as const, item }))
        : load('certificates').then((item) => ({ kind: 'certificates' as const, item })),
    loadPropertyLegal(id),
    loadParties(),
    loadLandUseCodes(),
    getTranslations('propertyLegal'),
    getLocale(),
    getMessages(),
  ]);
  if (editing !== null && loaded.item === null) notFound();
  const certificates: CertificateOption[] = legal.certificates.map((certificate) => ({
    id: certificate.id,
    label: [t('form', { form: certificate.form }), certificate.serial_no].filter((part) => part !== null).join(' · '),
  }));
  const { money, date, toast } = messages.components;
  const title = editing === null ? t('newTitle', { kind }) : t('editTitle', { kind });

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/properties/${id}/legal`} label={property.nickname} />
      <h1 className="text-h2 break-words text-balance lg:text-h1">{title}</h1>
      <PropertyIntl locale={locale} messages={{ propertyLegal: messages.propertyLegal, components: { money, date, toast } }}>
        {loaded.kind === 'parcels' ? (
          <ParcelForm propertyId={id} itemId={editing} initial={loaded.item} codes={codes} certificates={certificates} />
        ) : loaded.kind === 'structures' ? (
          <StructureForm propertyId={id} itemId={editing} initial={loaded.item} certificates={certificates} />
        ) : (
          <CertificateForm propertyId={id} itemId={editing} initial={loaded.item} parties={parties} />
        )}
      </PropertyIntl>
    </div>
  );
}
