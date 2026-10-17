import { FileText, Home, LandPlot, Plus } from 'lucide-react';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';
import { CertificateCard } from '@/components/legal/certificate-card';
import { ParcelList, ParcelTotal } from '@/components/legal/parcel-list';
import { StructureList } from '@/components/legal/structure-list';
import { PropertyIntl } from '@/components/properties/property-intl';
import { buttonVariants } from '@/components/ui/button-variants';
import { UndoToastProvider } from '@/components/undo-toast';
import { requireMember } from '@/server/member';
import { loadPropertyDetail } from '@/server/properties/detail';
import { loadLandUseCodes, loadParties, loadPropertyLegal, type LegalKind } from '@/server/properties/legal';
import { PropertyDetailFrame } from '../detail-frame';

function Section({ id, title, aside, action, children }: { id: string; title: string; aside?: ReactNode; action: { href: string; label: string } | null; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-testid={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="text-h3 text-ink">
            {title}
          </h2>
          {aside}
        </div>
        {action === null ? null : (
          <Link href={action.href} className={buttonVariants({ variant: 'outline' })}>
            <Plus aria-hidden="true" />
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function PropertyLegalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await loadPropertyDetail(id);
  if (property === null) notFound();
  const [member, legal, parties, codes, t, locale, messages] = await Promise.all([
    requireMember(),
    loadPropertyLegal(id),
    loadParties(),
    loadLandUseCodes(),
    getTranslations('propertyLegal'),
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

  return (
    <PropertyDetailFrame property={property} tab="legal">
      <PropertyIntl locale={locale} messages={{ components: { toast: messages.components.toast } }}>
        <UndoToastProvider>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <Section id="legal-certificates" title={t('certificatesTitle')} action={legal.certificates.length === 0 ? null : addCertificate}>
              {legal.certificates.length === 0 ? (
                <EmptyState title={t('certificatesEmpty')} body={t('certificatesEmptyBody')} icon={FileText} {...(addCertificate === null ? {} : { action: addCertificate })} />
              ) : (
                <ul className="flex flex-col gap-3">
                  {legal.certificates.map((certificate) => (
                    <CertificateCard key={certificate.id} propertyId={id} certificate={certificate} parties={partyById} canEdit={canEdit} />
                  ))}
                </ul>
              )}
            </Section>
            <div className="flex flex-col gap-8">
              <Section
                id="legal-parcels"
                title={t('parcelsTitle')}
                aside={legal.parcels.length === 0 ? null : <ParcelTotal parcels={legal.parcels} />}
                action={legal.parcels.length === 0 ? null : addParcel}
              >
                {legal.parcels.length === 0 ? (
                  <EmptyState title={t('parcelsEmpty')} body={t('parcelsEmptyBody')} icon={LandPlot} {...(addParcel === null ? {} : { action: addParcel })} />
                ) : (
                  <ParcelList propertyId={id} parcels={legal.parcels} codes={codeByCode} canEdit={canEdit} />
                )}
              </Section>
              <Section id="legal-structures" title={t('structuresTitle')} action={legal.structures.length === 0 ? null : addStructure}>
                {legal.structures.length === 0 ? (
                  <EmptyState title={t('structuresEmpty')} body={t('structuresEmptyBody')} icon={Home} {...(addStructure === null ? {} : { action: addStructure })} />
                ) : (
                  <StructureList propertyId={id} structures={legal.structures} canEdit={canEdit} />
                )}
              </Section>
            </div>
          </div>
        </UndoToastProvider>
      </PropertyIntl>
    </PropertyDetailFrame>
  );
}
