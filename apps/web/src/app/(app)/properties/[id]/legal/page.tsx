import { formatShareBp, ownershipStatus } from '@esta/core/properties/ownership';
import { FileText, Home, LandPlot, Plus } from 'lucide-react';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { RegistryEmptyState } from '@/components/registry-empty-state';
import { CertificateCard } from '@/components/legal/certificate-card';
import { FocusAnchor } from '@/components/completeness/use-focus-anchor';
import { OwnersSection } from '@/components/legal/owners-section';
import { OwnershipSheet } from '@/components/legal/ownership-sheet';
import { ParcelList, ParcelTotal } from '@/components/legal/parcel-list';
import { StructureList } from '@/components/legal/structure-list';
import { PropertyIntl } from '@/components/properties/property-intl';
import { SummaryStrip, type Figure } from '@/components/summary-strip';
import { buttonVariants } from '@/components/ui/button-variants';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import type { LegalKind } from '@esta/ops';
import { loadLandUseCodes, loadOwnership, loadParties, loadPropertyLegal } from '@/server/properties/legal';
import { PropertyDetailFrame } from '../detail-frame';

function Section({
  id,
  title,
  aside,
  action,
  control,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  action: { href: string; label: string } | null;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-testid={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="text-title-3 text-text">
            {title}
          </h2>
          {aside}
        </div>
        {action === null ? null : (
          <Link href={action.href} className={buttonVariants({ variant: 'secondary' })}>
            <Plus aria-hidden="true" />
            {action.label}
          </Link>
        )}
        {control}
      </div>
      {children}
    </section>
  );
}

const countFigure = (label: string, count: number, value: (count: number) => string, none: string): Figure =>
  count === 0 ? { label, value: null, sub: none } : { label, value: value(count) };

export default async function PropertyLegalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const [member, legal, shares, parties, codes, t, owners, locale, messages] = await Promise.all([
    requireMember(),
    loadPropertyLegal(id),
    loadOwnership(id),
    loadParties(),
    loadLandUseCodes(),
    getTranslations('propertyLegal'),
    getTranslations('propertyOwners'),
    getLocale(),
    getMessages(),
  ]);
  const canEdit = member.role !== 'viewer';
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const codeByCode = new Map(codes.map((code) => [code.code, code]));
  const add = (kind: LegalKind, label: string) => (canEdit ? { href: `/properties/${id}/legal/${kind}/new`, label } : null);
  const addCertificate = add('certificates', t('addCertificate'));
  const addParcel = add('parcels', t('addParcel'));
  const addStructure = add('structures', t('addStructure'));
  const ownersEditor = canEdit ? (
    <OwnershipSheet
      propertyId={id}
      shares={shares}
      parties={parties}
      holderIds={[...new Set(legal.certificates.flatMap((certificate) => certificate.holder_party_ids))]}
      adding={shares.length === 0}
      label={shares.length === 0 ? owners('add') : owners('edit')}
    />
  ) : null;
  const { date } = messages.components;
  const partyMessages = Object.fromEntries(Object.entries(messages.propertyLegal).filter(([key]) => key.startsWith('party')));

  return (
    <PropertyDetailFrame property={property} tab="legal">
      <FocusAnchor />
      <SummaryStrip
        label={t('stripLabel')}
        unknownLabel={t('unknownFigure')}
        figures={[
          countFigure(t('figureCertificates'), legal.certificates.length, (count) => t('figureCertificatesValue', { count }), t('figureSubNone')),
          countFigure(t('figureParcels'), legal.parcels.length, (count) => t('figureParcelsValue', { count }), t('figureSubNone')),
          countFigure(t('figureStructures'), legal.structures.length, (count) => t('figureStructuresValue', { count }), t('figureSubNone')),
        ]}
      />
      <PropertyIntl locale={locale} messages={{ components: { date }, propertyLegal: partyMessages, propertyOwners: messages.propertyOwners }}>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-8">
          <Section id="legal-certificates" title={t('certificatesTitle')} action={legal.certificates.length === 0 ? null : addCertificate}>
            {legal.certificates.length === 0 ? (
              <RegistryEmptyState surface="propertyLegalCertificates" ctx={{ canWrite: canEdit, propertyId: id }} icon={FileText} />
            ) : (
              <ul className="flex flex-col gap-3">
                {legal.certificates.map((certificate) => (
                  <CertificateCard key={certificate.id} propertyId={id} certificate={certificate} parties={partyById} canEdit={canEdit} />
                ))}
              </ul>
            )}
          </Section>
          <Section
            id="owners"
            title={owners('title')}
            aside={
              shares.length === 0 ? null : (
                <p data-testid="ownership-total" className="num text-body font-medium text-text">
                  {owners('total', { total: formatShareBp(ownershipStatus(shares).totalBp, locale) })}
                </p>
              )
            }
            action={null}
            control={shares.length === 0 ? null : ownersEditor}
          >
            <OwnersSection shares={shares} parties={partyById} editor={ownersEditor} />
          </Section>
          </div>
          <div className="flex flex-col gap-8">
            <Section
              id="legal-parcels"
              title={t('parcelsTitle')}
              aside={legal.parcels.length === 0 ? null : <ParcelTotal parcels={legal.parcels} />}
              action={legal.parcels.length === 0 ? null : addParcel}
            >
              {legal.parcels.length === 0 ? (
                <RegistryEmptyState surface="propertyLegalParcels" ctx={{ canWrite: canEdit, propertyId: id }} icon={LandPlot} />
              ) : (
                <ParcelList propertyId={id} parcels={legal.parcels} codes={codeByCode} canEdit={canEdit} />
              )}
            </Section>
            <Section id="legal-structures" title={t('structuresTitle')} action={legal.structures.length === 0 ? null : addStructure}>
              {legal.structures.length === 0 ? (
                <RegistryEmptyState surface="propertyLegalStructures" ctx={{ canWrite: canEdit, propertyId: id }} icon={Home} />
              ) : (
                <StructureList propertyId={id} structures={legal.structures} canEdit={canEdit} />
              )}
            </Section>
          </div>
        </div>
      </PropertyIntl>
    </PropertyDetailFrame>
  );
}
