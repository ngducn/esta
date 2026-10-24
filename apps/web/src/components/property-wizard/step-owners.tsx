import { ownersFromHolders, type CertificateHolder } from '@esta/core/properties/owners-from-holders';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { z } from 'zod';
import { buttonVariants } from '@/components/ui/button-variants';
import { requireMember } from '@/server/member';
import { loadOwnership, loadParties, loadPropertyLegal } from '@/server/properties/legal';
import { createSessionClient } from '@/server/supabase/server';
import { LazyOwnershipForm } from './lazy-steps';

const accepted = z.record(z.string(), z.object({ value: z.unknown() }));
const HOLDER_FIELD = /^holders\[(\d+)\]\.(full_name|id_last4)$/;

/** The holders an accepted certificate read names, in their printed order. */
function holdersOf(acceptedFields: unknown): CertificateHolder[] {
  const parsed = accepted.safeParse(acceptedFields);
  if (!parsed.success) return [];
  const rows = new Map<number, { fullName?: string; idLast4?: string }>();
  for (const [path, { value }] of Object.entries(parsed.data)) {
    const match = HOLDER_FIELD.exec(path);
    if (match === null || typeof value !== 'string') continue;
    const row = rows.get(Number(match[1])) ?? {};
    rows.set(Number(match[1]), match[2] === 'full_name' ? { ...row, fullName: value } : { ...row, idLast4: value });
  }
  return [...rows.entries()]
    .toSorted(([a], [b]) => a - b)
    .flatMap(([, row]) => (row.fullName === undefined ? [] : [{ fullName: row.fullName, idLast4: row.idLast4 ?? null }]));
}

/**
 * Step `owners`: the saved set when there is one, else the holders the accepted certificate's review linked, split
 * equally (`ownersFromHolders`), saved through the P1-10 ownership action.
 */
export async function StepOwners({ propertyId, documentId, next, back }: { propertyId: string; documentId: string | null; next: string; back: string }) {
  const [member, supabase, t, saved, parties, legal] = await Promise.all([
    requireMember(),
    createSessionClient(),
    getTranslations('propertyWizard'),
    loadOwnership(propertyId),
    loadParties(),
    loadPropertyLegal(propertyId),
  ]);
  const read =
    documentId === null
      ? null
      : (
          await supabase
            .from('document_extractions')
            .select('id, status, accepted_fields')
            .eq('household_id', member.household.id)
            .eq('document_id', documentId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data;
  let proposed = saved;
  if (saved.length === 0 && read?.status === 'accepted') {
    const [{ data: rows }, { data: certificate }] = await Promise.all([
      supabase.from('parties').select('id, full_name, id_last4').eq('household_id', member.household.id),
      supabase.from('certificates').select('holder_party_ids').eq('household_id', member.household.id).eq('extraction_id', read.id).maybeSingle(),
    ]);
    proposed = ownersFromHolders(
      holdersOf(read.accepted_fields),
      (rows ?? []).map((row) => ({ id: row.id, fullName: row.full_name, idLast4: row.id_last4 })),
      certificate?.holder_party_ids ?? [],
    );
  }
  const note =
    saved.length === 0 && proposed.length > 0
      ? t('ownersFromCertificate', { count: proposed.length })
      : saved.length === 0 && documentId !== null && read?.status !== 'accepted'
        ? t('ownersLater')
        : null;
  return (
    <section aria-labelledby="wizard-owners-title" data-testid="wizard-owners" className="flex max-w-3xl flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="wizard-owners-title" className="text-lead font-semibold text-ink">
          {t('ownersTitle')}
        </h2>
        <p className="max-w-prose text-body text-pretty text-ink-2">{t('ownersHelp')}</p>
      </div>
      {note === null ? null : (
        <p data-testid="owners-note" className="rounded-md bg-surface-2 px-4 py-3 text-body text-ink-2">
          {note}
        </p>
      )}
      <LazyOwnershipForm
        key={proposed.map((share) => share.party_id).join()}
        propertyId={propertyId}
        shares={proposed}
        parties={parties}
        holderIds={[...new Set(legal.certificates.flatMap((certificate) => certificate.holder_party_ids))]}
        inSheet={false}
        savedHref={next}
        saveLabel={t('saveAndContinue')}
        cancel={
          <Link href={back} className={buttonVariants({ variant: 'outline' })}>
            {t('back')}
          </Link>
        }
      />
      <Link href={next} data-testid="skip-step" className="self-start text-body font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
        {t('later')}
      </Link>
    </section>
  );
}
