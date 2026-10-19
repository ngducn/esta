import type { Metadata } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { FinishChecklist } from '@/components/property-wizard/finish-checklist';
import { LazyReviewReadyNotice, LazyStepUse } from '@/components/property-wizard/lazy-steps';
import { StepDetails } from '@/components/property-wizard/step-details';
import { StepOwners } from '@/components/property-wizard/step-owners';
import { StepPhoto } from '@/components/property-wizard/step-photo';
import { StepReview } from '@/components/property-wizard/step-review';
import { readWizard, wizardHref, wizardMachine, wizardPath, type WizardEvent, type WizardIds } from '@/components/property-wizard/wizard-machine';
import { cn } from '@/lib/utils';
import { readDocumentStatuses } from '@/server/documents/status';
import { requireMember } from '@/server/member';
import { loadPropertyCodes } from '@/server/properties/form';
import { PROPERTY_KINDS, USE_MODES } from '@esta/core/properties/form';
import { createSessionClient } from '@/server/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('propertyForm');
  return { title: t('newTitle') };
}

const propertyRow = z.object({
  nickname: z.string(),
  kind: z.enum(PROPERTY_KINDS),
  use_mode: z.enum(USE_MODES),
  kind_details: z.object({ room_count: z.number().int().optional() }).loose(),
  units: z.array(z.object({ kind: z.string() })),
});

type WizardProperty = z.output<typeof propertyRow> & { readonly documentId: string | null };

/** The wizard's property under RLS, and its certificate only when that document is this property's. */
async function loadWizardProperty(householdId: string, ids: WizardIds): Promise<WizardProperty | null> {
  const supabase = await createSessionClient();
  const [property, document] = await Promise.all([
    supabase
      .from('properties')
      .select('nickname, kind, use_mode, kind_details, units(kind)')
      .eq('household_id', householdId)
      .eq('id', ids.propertyId)
      .is('deleted_at', null)
      .maybeSingle(),
    ids.documentId === null
      ? Promise.resolve({ data: null })
      : supabase.from('documents').select('id').eq('household_id', householdId).eq('property_id', ids.propertyId).eq('id', ids.documentId).is('deleted_at', null).maybeSingle(),
  ]);
  const parsed = propertyRow.safeParse(property.data);
  return parsed.success ? { ...parsed.data, documentId: document.data?.id ?? null } : null;
}

/**
 * PRP-7's wizard (DESIGN-BRIEF §6.4). Step 1 creates the property, and from then on the URL holds the step, so each
 * later step is a server render over that property and a reload lands where the user was.
 */
export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireMember();
  if (member.role === 'viewer') notFound();
  const params = await searchParams;
  const [t, nav, locale, messages] = await Promise.all([getTranslations('propertyWizard'), getTranslations('nav'), getLocale(), getMessages()]);
  const named = readWizard(params);
  const property = named.ids === null ? null : await loadWizardProperty(member.household.id, named.ids);
  if (named.ids !== null && property === null) notFound();
  // A document that is not this property's certificate is read as no photo at all.
  const { state, ids } = named.ids?.documentId != null && property?.documentId === null ? readWizard({ ...params, document: undefined }) : named;
  const go = (event: WizardEvent) => wizardHref(wizardMachine(state, event, { reviewReady: true }), ids);

  const path = wizardPath(state.photo);
  const position = path.indexOf(state.step);
  const { money, date, confirm, toast } = messages.components;
  const { purposeCodeHint, unknownCode } = messages.propertyLegal;
  const islandMessages = {
    propertyWizard: messages.propertyWizard,
    propertyForm: messages.propertyForm,
    properties: messages.properties,
    components: { money, date, confirm, toast },
    ...(state.step === 'photo' ? { documents: messages.documents } : {}),
    ...(state.step === 'review' ? { extraction: messages.extraction, propertyLegal: { purposeCodeHint, unknownCode } } : {}),
    ...(state.step === 'owners' ? { propertyOwners: messages.propertyOwners, propertyLegal: messages.propertyLegal } : {}),
  };

  let step;
  if (ids === null || property === null) step = <StepPhoto otherCodes={await loadPropertyCodes(member.household.id, null)} />;
  else if (state.step === 'details') step = <StepDetails propertyId={ids.propertyId} next={go('next')} />;
  else if (state.step === 'review' && ids.documentId !== null)
    step = <StepReview propertyId={ids.propertyId} documentId={ids.documentId} selfHref={wizardHref(state, ids)} backHref={go('closeReview')} />;
  else if (state.step === 'owners') step = <StepOwners propertyId={ids.propertyId} documentId={ids.documentId} next={go('next')} back={go('back')} />;
  else if (state.step === 'use')
    step = (
      <LazyStepUse
        propertyId={ids.propertyId}
        kind={property.kind}
        useMode={property.use_mode}
        rooms={property.units.filter((unit) => unit.kind === 'room').length}
        suggestedRooms={property.kind_details.room_count ?? null}
        next={go('next')}
        back={go('back')}
      />
    );
  else step = <FinishChecklist propertyId={ids.propertyId} nickname={property.nickname} />;

  const statuses = ids?.documentId == null || state.step === 'review' ? null : await readDocumentStatuses(ids.documentId, 'document');

  return (
    <div className="flex flex-col gap-5" data-testid="property-wizard" data-step={state.step}>
      <BackLink href="/properties" label={nav('properties')} />
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-h2 break-words lg:text-h1">{property === null ? t('pageTitle') : property.nickname}</h1>
        <div className="flex flex-col gap-2">
          <p data-testid="wizard-progress" className="text-body font-semibold text-ink-2 figures">
            {t('progress', { n: position + 1, total: path.length, step: state.step })}
          </p>
          <ol aria-hidden="true" className="flex gap-1.5">
            {path.map((name, index) => (
              <li key={name} className={cn('h-1.5 flex-1 rounded-full', index <= position ? 'bg-accent' : 'bg-rule')} />
            ))}
          </ol>
        </div>
      </header>
      <PropertyIntl locale={locale} messages={islandMessages}>
        {statuses === null || ids?.documentId == null ? null : (
          <LazyReviewReadyNotice documentId={ids.documentId} statuses={statuses} reviewHref={go('openReview')} />
        )}
        {step}
      </PropertyIntl>
    </div>
  );
}
