'use client';

import type { FieldDecision } from '@esta/core/extraction/acceptance';
import type { SchemaName } from '@esta/core/extraction/fields';
import { formatArea } from '@esta/core/format';
import { purposesMismatch } from '@esta/core/properties/area';
import { CircleCheck, CloudOff, FilePlus2, FileSearch, Images, Save } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDocumentStatuses, type PollStep } from '@/components/documents/use-document-status';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocumentStatuses, ExtractionStatus } from '@/server/documents/extraction-status';
import { rejectExtraction, saveExtractionReview, type ReviewSave } from '@/server/extraction/actions';
import type { LandUseCode } from '@/server/properties/legal';
import { DocumentPager } from './document-pager';
import type { FieldView } from '@/server/extraction/field-views';
import { ExtractionFieldRow, rowArea, type RowError } from './extraction-field-row';

export type ReviewMode = 'waiting' | 'review' | 'manual' | 'accepted' | 'rejected' | 'none';

function nextStep(schemaName: SchemaName, propertyId: string, documentId: string): { readonly href: string; readonly tab: 'legal' | 'rental' | null } {
  if (schemaName === 'lease_v1') return { href: `/properties/${propertyId}/rental/leases/new?fromDocument=${documentId}`, tab: null };
  const tab = schemaName === 'utility_bill_v1' ? 'rental' : 'legal';
  return { href: `/properties/${propertyId}/${tab}`, tab };
}

/** Mẹ waits on this page, so it asks every second for the first half minute, then backs off as the tiles do. */
const REVIEW_POLL: readonly PollStep[] = [
  { everyMs: 1_000, times: 30 },
  { everyMs: 5_000, times: 6 },
  { everyMs: 10_000, times: 24 },
];

type Section = { readonly key: string; readonly list: string; readonly number: number; readonly fields: readonly FieldView[] };

function sectionsOf(fields: readonly FieldView[]): Section[] {
  const sections: Section[] = [];
  for (const field of fields) {
    const last = sections.at(-1);
    if (last?.key === field.section.key) sections[sections.length - 1] = { ...last, fields: [...last.fields, field] };
    else sections.push({ ...field.section, fields: [field] });
  }
  return sections;
}

export function ReviewPanel({
  documentId,
  title,
  mime,
  pageCount,
  fileUrl,
  reviewUrl,
  thumbUrl,
  mode,
  extractionId,
  schemaName,
  fields,
  statuses,
  renderedStatus,
  canEdit,
  landUseCodes,
  propertyId,
  leaseId = null,
  properties,
  savedHref,
}: {
  documentId: string;
  title: string;
  mime: string;
  pageCount: number;
  fileUrl: string | null;
  reviewUrl: string | null;
  thumbUrl: string | null;
  mode: ReviewMode;
  extractionId: string | null;
  schemaName: SchemaName;
  fields: readonly FieldView[];
  statuses: DocumentStatuses;
  renderedStatus: ExtractionStatus;
  canEdit: boolean;
  landUseCodes: readonly LandUseCode[];
  propertyId: string | null;
  /** The lease a scanned contract already belongs to. */
  leaseId?: string | null;
  properties: readonly { readonly id: string; readonly nickname: string }[];
  /** Where a save goes instead of the property's tab: the wizard's own review step, which then confirms the address. */
  savedHref?: string;
}) {
  const t = useTranslations('extraction');
  const leaseToCreate = schemaName === 'lease_v1' && leaseId === null;
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [showDocument, setShowDocument] = useState(true);
  const [decisions, setDecisions] = useState<Readonly<Record<string, FieldDecision>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReviewSave | { ok: false; reason: 'reject_failed' } | null>(null);
  const [chosenProperty, setChosenProperty] = useState('');
  const [saving, startSaving] = useTransition();
  const pager = useRef<HTMLDivElement>(null);

  const polled = useDocumentStatuses(documentId, statuses, { by: 'document', steps: REVIEW_POLL });
  const liveStatus = polled.statuses[documentId] ?? renderedStatus;
  useEffect(() => {
    // queued and running render the same waiting notice, so only a read that ends fetches the page again.
    const reading = (status: ExtractionStatus) => status === 'queued' || status === 'running';
    if (liveStatus !== renderedStatus && !(reading(liveStatus) && reading(renderedStatus))) router.refresh();
  }, [liveStatus, renderedStatus, router]);

  const sections = useMemo(() => sectionsOf(fields), [fields]);
  const errors: Readonly<Record<string, RowError>> =
    outcome !== null && !outcome.ok && 'paths' in outcome ? Object.fromEntries(outcome.paths.map((path) => [path, outcome.reason])) : {};
  const decided = fields.filter((field) => decisions[field.path] !== undefined).length;
  const valueOf = (path: string) => {
    const field = fields.find((candidate) => candidate.path === path);
    return field === undefined ? null : rowArea(field, decisions[path]);
  };

  const goToPage = (next: number) => {
    setPage(next);
    setShowDocument(true);
    pager.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const decide = (path: string, decision: FieldDecision | undefined) => {
    setOutcome(null);
    setDecisions((current) => {
      const { [path]: _previous, ...rest } = current;
      return decision === undefined ? rest : { ...rest, [path]: decision };
    });
  };

  const save = () =>
    startSaving(async () => {
      if (extractionId === null) return;
      const result = await saveExtractionReview(extractionId, decisions, propertyId === null && chosenProperty !== '' ? chosenProperty : null).catch(
        (): ReviewSave => ({ ok: false, reason: 'failed' }),
      );
      setOutcome(result);
      if (!result.ok) return;
      if (savedHref === undefined) router.push(nextStep(schemaName, result.propertyId, documentId).href);
      else router.refresh();
    });

  const reject = () =>
    startSaving(async () => {
      if (extractionId === null) return;
      const ok = await rejectExtraction(extractionId).catch(() => false);
      if (ok) router.refresh();
      else setOutcome({ ok: false, reason: 'reject_failed' });
    });

  const saveMessage =
    outcome === null || outcome.ok
      ? null
      : outcome.reason === 'invalid'
        ? t('saveInvalid', { count: outcome.paths.length })
        : outcome.reason === 'out_of_range'
          ? t('saveOutOfRange', { count: outcome.paths.length })
          : outcome.reason === 'national_id'
            ? t('saveNationalId')
            : outcome.reason === 'missing'
              ? t('saveMissing')
              : outcome.reason === 'no_property'
                ? t('saveNoProperty')
                : outcome.reason === 'reject_failed'
                  ? t('rejectFailed')
                  : t('saveFailed');

  const notice =
    mode === 'waiting' ? (
      polled.workerOffline && polled.offlineSince != null ? (
        <p data-testid="review-offline" role="status" className="flex items-start gap-3 rounded-md bg-due-fill px-4 py-3 text-body font-medium text-due">
          <CloudOff className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0 break-words">{t('offline', { time: polled.offlineSince })}</span>
        </p>
      ) : (
        <p data-testid="review-reading" role="status" className="flex items-start gap-3 rounded-md bg-surface-2 px-4 py-3 text-body text-ink-2">
          <FileSearch className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          <span className="min-w-0 break-words">{t('reading')}</span>
        </p>
      )
    ) : null;

  const reviewing = mode === 'review' || mode === 'manual';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <section
        ref={pager}
        aria-label={t('documentPanel')}
        className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-rule bg-surface p-4 shadow-card lg:sticky lg:top-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lead font-bold text-ink">
            <Images className="size-5 shrink-0 text-ink-2" strokeWidth={1.8} aria-hidden="true" />
            <span className="min-w-0 break-words">{t('documentPanel')}</span>
          </h2>
          <Button type="button" variant="quiet" className="lg:hidden" aria-expanded={showDocument} data-testid="toggle-document" onClick={() => setShowDocument((shown) => !shown)}>
            {showDocument ? t('hideDocument') : t('showDocument')}
          </Button>
        </div>
        <div className={cn(!showDocument && 'max-lg:hidden')}>
          <DocumentPager documentId={documentId} fileUrl={fileUrl} reviewUrl={reviewUrl} thumbUrl={thumbUrl} mime={mime} pageCount={pageCount} title={title} page={page} onPage={setPage} />
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        {notice}
        {mode === 'accepted' ? (
          <section data-testid="review-accepted" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card">
            <h2 className="flex items-center gap-2 text-lead font-bold text-ink">
              <CircleCheck className="size-5 shrink-0 text-paid" strokeWidth={2} aria-hidden="true" />
              {t(leaseToCreate ? 'acceptedLeaseTitle' : 'acceptedTitle')}
            </h2>
            <p className="text-body text-ink-2">{t(leaseToCreate ? 'acceptedLeaseBody' : 'acceptedBody')}</p>
            {propertyId === null ? null : <AcceptedLink {...nextStep(schemaName, propertyId, documentId)} leaseHref={leaseId === null ? null : `/properties/${propertyId}/rental/leases/${leaseId}`} canEdit={canEdit} />}
          </section>
        ) : null}
        {mode === 'rejected' || mode === 'none' ? (
          <p data-testid="review-closed" className="rounded-lg border border-rule bg-surface p-5 text-body text-ink-2 shadow-card">
            {mode === 'rejected' ? t('rejected') : t('notExtractable')}
          </p>
        ) : null}
        {reviewing ? (
          <>
            <p data-testid="review-intro" className="text-body text-pretty text-ink-2">
              {mode === 'manual' ? t('manualIntro') : t('intro')}
            </p>
            {canEdit ? null : <p className="text-body font-semibold text-ink-2">{t('viewerNote')}</p>}
            {sections.map((section) => {
              const mismatch =
                section.list === 'parcels'
                  ? purposesMismatch({
                      area_m2: valueOf(`${section.key}.area_m2`),
                      purposes: fields
                        .filter((field) => field.path.startsWith(`${section.key}.purposes[`) && field.path.endsWith('.area_m2'))
                        .map((field) => ({ area_m2: valueOf(field.path) ?? undefined })),
                    })
                  : null;
              const heading = `${section.key || 'root'}-heading`;
              return (
                <section key={section.key || 'root'} aria-labelledby={heading} data-testid="review-section" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card">
                  <h2 id={heading} className="text-lead font-bold break-words text-ink">
                    {t('section', { list: section.list, n: section.number })}
                  </h2>
                  {mismatch === null ? null : (
                    <p data-testid="area-mismatch" role="note" className="flex items-start gap-3 rounded-md bg-due-fill px-4 py-3 text-body font-medium text-due">
                      <span className="min-w-0 break-words">
                        {t('areaMismatch', { parcel: formatArea(mismatch.parcel, locale), purposes: formatArea(mismatch.purposes, locale) })}
                      </span>
                    </p>
                  )}
                  <ul className="flex flex-col divide-y divide-rule">
                    {section.fields.map((field) => (
                      <ExtractionFieldRow
                        key={field.path}
                        field={field}
                        decision={decisions[field.path]}
                        editing={editing === field.path}
                        error={errors[field.path] ?? null}
                        canEdit={canEdit}
                        landUseCodes={landUseCodes}
                        onDecide={(decision) => decide(field.path, decision)}
                        onEdit={(open) => setEditing(open ? field.path : null)}
                        onPage={goToPage}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {canEdit ? (
              <section aria-label={t('save')} data-testid="review-save" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card">
                {propertyId === null ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-body font-semibold text-ink">{t('propertyLabel')}</span>
                    <select
                      data-testid="review-property"
                      value={chosenProperty}
                      onChange={(event) => setChosenProperty(event.target.value)}
                      className="min-h-touch rounded-md border border-field bg-surface px-3 text-body text-ink"
                    >
                      <option value="">{t('propertyPlaceholder')}</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <p data-testid="review-progress" className="text-body text-ink-2 figures">
                  {t('progress', { done: decided, total: fields.length })}
                </p>
                {saveMessage === null ? null : (
                  <p role="alert" data-testid="review-error" className="text-body font-semibold text-overdue">
                    {saveMessage}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button type="button" data-testid="review-submit" disabled={saving || extractionId === null} onClick={save}>
                    <Save aria-hidden="true" />
                    {saving ? t('saving') : t('save')}
                  </Button>
                  {mode === 'review' ? (
                    <ConfirmDialog
                      title={t('rejectTitle', { title })}
                      description={t('rejectBody')}
                      triggerLabel={t('reject')}
                      confirmLabel={t('rejectConfirm')}
                      onConfirm={reject}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function AcceptedLink({ href, tab, leaseHref, canEdit }: { href: string; tab: 'legal' | 'rental' | null; leaseHref: string | null; canEdit: boolean }) {
  const t = useTranslations('extraction');
  const className = cn(buttonVariants({ variant: 'outline' }), 'self-start');
  if (tab !== null) {
    return (
      <a className={className} href={href}>
        {t('openTab', { tab })}
      </a>
    );
  }
  if (leaseHref !== null) {
    return (
      <a className={className} href={leaseHref} data-testid="open-lease">
        {t('openLease')}
      </a>
    );
  }
  return canEdit ? (
    <a className={cn(buttonVariants(), 'self-start')} href={href} data-testid="create-lease">
      <FilePlus2 aria-hidden="true" />
      {t('createLease')}
    </a>
  ) : null;
}
