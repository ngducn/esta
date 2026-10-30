import { z } from 'zod';
import { notFound } from 'next/navigation';
import { suggestCurrentUnits } from '@/server/address/suggest';
import { loadReview, reviewPanelState } from '@/server/extraction/review';
import { requireMember } from '@/server/member';
import { loadLandUseCodes } from '@/server/properties/legal';
import { createSessionClient } from '@/server/supabase/server';
import { LazyAddressConfirm, LazyReviewPanel } from './lazy-steps';

const addressRow = z.object({ certificate_address_text: z.string().nullable(), current_address: z.object({ commune_code: z.string().optional() }).nullable() });

/**
 * Step `review`: the P2-07 panel beside the photo. Once the fields are accepted, the certificate address it wrote is
 * matched to today's wards through `suggest_current_unit`, and the user confirms one before going back.
 */
export async function StepReview({ propertyId, documentId, selfHref, backHref }: { propertyId: string; documentId: string; selfHref: string; backHref: string }) {
  const review = await loadReview(documentId);
  if (review === null || review.document.propertyId !== propertyId) notFound();
  const { document, extraction } = review;
  const { status, mode, fields } = await reviewPanelState(extraction);
  if (status === 'accepted') {
    const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
    const { data } = await supabase
      .from('properties')
      .select('certificate_address_text, current_address')
      .eq('household_id', member.household.id)
      .eq('id', propertyId)
      .maybeSingle();
    const row = addressRow.catch({ certificate_address_text: null, current_address: null }).parse(data);
    const text = row.certificate_address_text ?? '';
    const suggestions = text.trim().length < 3 ? [] : await suggestCurrentUnits(text);
    return (
      <LazyAddressConfirm propertyId={propertyId} certificateAddress={text} suggestions={suggestions} picked={row.current_address?.commune_code ?? null} continueHref={backHref} />
    );
  }
  return (
    <LazyReviewPanel
      documentId={document.id}
      title={document.title}
      mime={document.mime}
      pageCount={document.pageCount}
      fileUrl={review.fileUrl}
      reviewUrl={review.reviewUrl}
      thumbUrl={review.thumbUrl}
      mode={mode}
      extractionId={extraction?.id ?? null}
      schemaName={extraction?.schemaName ?? 'certificate_v1'}
      fields={fields}
      statuses={review.statuses}
      renderedStatus={status}
      canEdit={review.canEdit}
      landUseCodes={await loadLandUseCodes()}
      propertyId={propertyId}
      properties={review.properties}
      certificateAddresses={review.certificateAddresses}
      savedHref={selfHref}
    />
  );
}
