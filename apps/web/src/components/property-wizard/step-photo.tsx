'use client';

import { PROPERTY_KINDS, suggestPropertyCode, type PropertyKind } from '@esta/core/properties/form';
import { Camera, Files, FolderOpen, RotateCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { DuplicateDialog } from '@/components/documents/duplicate-dialog';
import { LeaveConfirm, MultiPageCapture, type CombinedCapture } from '@/components/documents/multi-page-capture';
import { UploadProgress } from '@/components/documents/upload-progress';
import { FieldMessage } from '@/components/field-message';
import { Group, TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';
import { useObjectUrl } from '@/lib/use-object-url';
import { cn } from '@/lib/utils';
import { ACCEPT, checkFile, prepareCapture, prepareFile, sendPrepared, type FileProblem, type Prepared } from '@/lib/upload/prepare';
import { createDocumentUpload, type UploadTicket } from '@/server/documents/actions';
import { startPropertyWizard } from '@/server/properties/wizard';
import { wizardHref } from './wizard-machine';

type Ticket = Extract<UploadTicket, { ok: true }>;
type Choice = 'undecided' | 'photo' | 'skip';

/**
 * What the save is doing. `ticket` and `uploaded` survive a failure, so `Thử lại` signs no second upload and sends
 * the bytes again only when they never arrived.
 */
type Phase =
  | { readonly step: 'editing' }
  | { readonly step: 'preparing' }
  | { readonly step: 'duplicate'; readonly ticket: Ticket }
  | { readonly step: 'uploading'; readonly loaded: number; readonly total: number }
  | { readonly step: 'starting' }
  | { readonly step: 'failed'; readonly reason: 'network' | 'code_taken'; readonly takenBy?: string };

const pickerClass =
  'relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm px-4 text-body font-semibold has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

/** Step 1 (PRP-7): the certificate photo or a skip, then the nickname and kind; leaving it creates the property. */
export function StepPhoto({ otherCodes }: { otherCodes: readonly string[] }) {
  const t = useTranslations('propertyWizard');
  const td = useTranslations('documents');
  const tf = useTranslations('propertyForm');
  const tp = useTranslations('properties');
  const locale = useLocale();
  const router = useRouter();
  const hydrated = useHydrated();
  const fieldId = useId();
  const [choice, setChoice] = useState<Choice>('undecided');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [problem, setProblem] = useState<FileProblem>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedPages, setCapturedPages] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameMissing, setNicknameMissing] = useState(false);
  const [kind, setKind] = useState<PropertyKind>('townhouse');
  const [taken, setTaken] = useState<readonly string[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: 'editing' });
  const propertyId = useRef<string | null>(null);
  const ticket = useRef<{ ticket: Ticket; uploaded: boolean; sha256: string } | null>(null);
  const picking = useRef(0);
  const preview = useObjectUrl(prepared?.previews.thumb ?? null);

  const busy = phase.step === 'preparing' || phase.step === 'uploading' || phase.step === 'starting';
  const code = suggestPropertyCode(nickname, [...otherCodes, ...taken]);

  const chosen = async (result: Promise<Prepared | null>) => {
    const mine = ++picking.current;
    setPrepared(null);
    setPhase({ step: 'preparing' });
    const ready = await result;
    if (picking.current !== mine) return;
    if (ready === null) setProblem('unreadable');
    else {
      setPrepared(ready);
      setChoice('photo');
    }
    setPhase({ step: 'editing' });
  };

  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    const wrong = checkFile(file);
    setProblem(wrong);
    if (wrong === null) void chosen(prepareFile(file));
  };

  const combined = (capture: CombinedCapture) => {
    setCapturing(false);
    setProblem(null);
    void chosen(prepareCapture(capture));
  };

  const start = async (document: { ticket: Ticket; file: Prepared } | null) => {
    const id = (propertyId.current ??= crypto.randomUUID());
    setPhase({ step: 'starting' });
    const result = await startPropertyWizard({
      propertyId: id,
      nickname,
      code,
      kind,
      document:
        document === null
          ? null
          : {
              documentId: document.ticket.documentId,
              filename: document.file.file.name,
              mime: document.file.file.type,
              size: document.file.file.size,
              sha256: document.file.sha256,
              pageCount: document.file.previews.pageCount,
            },
    }).catch(() => ({ ok: false, reason: 'failed' }) as const);
    if (result.ok) {
      router.push(wizardHref({ step: 'details', photo: result.documentId !== null }, { propertyId: result.propertyId, documentId: result.documentId }));
      return;
    }
    if (result.reason === 'code_taken') {
      setTaken((current) => [...current, result.code]);
      setPhase({ step: 'failed', reason: 'code_taken', takenBy: result.takenBy });
    } else setPhase({ step: 'failed', reason: 'network' });
  };

  const upload = async (signed: Ticket, file: Prepared) => {
    ticket.current = { ticket: signed, uploaded: false, sha256: file.sha256 };
    setPhase({ step: 'uploading', loaded: 0, total: file.file.size });
    try {
      await sendPrepared(signed, file, ({ loaded, total }) => setPhase({ step: 'uploading', loaded, total }));
    } catch {
      setPhase({ step: 'failed', reason: 'network' });
      return;
    }
    ticket.current = { ticket: signed, uploaded: true, sha256: file.sha256 };
    await start({ ticket: signed, file });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const missing = nickname.trim() === '';
    setNicknameMissing(missing);
    if (missing || choice === 'undecided') return;
    if (choice === 'skip' || prepared === null) {
      await start(null);
      return;
    }
    const held = ticket.current?.sha256 === prepared.sha256 ? ticket.current : null;
    if (held !== null) {
      if (held.uploaded) await start({ ticket: held.ticket, file: prepared });
      else await upload(held.ticket, prepared);
      return;
    }
    setPhase({ step: 'preparing' });
    const id = (propertyId.current ??= crypto.randomUUID());
    const signed = await createDocumentUpload({
      propertyId: id,
      category: 'certificate',
      filename: prepared.file.name,
      mime: prepared.file.type,
      size: prepared.file.size,
      sha256: prepared.sha256,
    }).catch(() => ({ ok: false }) as const);
    if (!signed.ok) {
      setPhase({ step: 'failed', reason: 'network' });
      return;
    }
    if (signed.duplicates.length > 0) setPhase({ step: 'duplicate', ticket: signed });
    else await upload(signed, prepared);
  };

  const errorText =
    phase.step !== 'failed' ? null : phase.reason === 'code_taken' ? tf('errorCodeTaken', { code: taken.at(-1) ?? code, nickname: phase.takenBy ?? '' }) : t('startFailed');

  if (capturing) {
    return (
      <section aria-labelledby={`${fieldId}-capture`} className="flex max-w-3xl flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-1">
          <h2 id={`${fieldId}-capture`} className="text-lead font-bold text-ink">
            {td('captureTitle')}
          </h2>
          <p className="text-body text-ink-2">{td('captureBody')}</p>
        </div>
        <MultiPageCapture
          confirming={leaving}
          onCount={setCapturedPages}
          onBack={() => (capturedPages > 0 ? setLeaving(true) : setCapturing(false))}
          onCombined={combined}
        />
        {leaving ? (
          <LeaveConfirm
            count={capturedPages}
            onKeep={() => setLeaving(false)}
            onDiscard={() => {
              setLeaving(false);
              setCapturing(false);
            }}
          />
        ) : null}
      </section>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex max-w-3xl flex-col gap-5" data-testid="wizard-photo">
      <fieldset disabled={!hydrated || busy} className="flex min-w-0 flex-col gap-5">
        <section aria-labelledby={`${fieldId}-question`} className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id={`${fieldId}-question`} className="text-lead font-bold text-ink">
              {t('photoQuestion')}
            </h2>
            <p className="max-w-prose text-body text-pretty text-ink-2">{t('photoHelp')}</p>
          </div>
          {prepared === null ? null : (
            <div data-testid="wizard-photo-chosen" className="flex items-center gap-3 rounded-md border border-rule bg-surface-2 p-3">
              {preview === null ? null : (
                // eslint-disable-next-line @next/next/no-img-element -- a local blob URL of the thumbnail made in this tab
                <img src={preview} alt={td('previewAlt')} data-testid="upload-preview" className="size-16 shrink-0 rounded-sm object-cover" />
              )}
              <p className="min-w-0 text-small break-words text-ink-2">
                {td('chosenFile', { name: prepared.file.name, size: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(prepared.file.size / 1024 / 1024) })}
                {prepared.previews.pageCount > 1 ? ` · ${td('pageCount', { count: prepared.previews.pageCount })}` : null}
              </p>
            </div>
          )}
          {choice === 'skip' ? (
            <p data-testid="wizard-skipped" className="rounded-md bg-surface-2 px-4 py-3 text-body text-ink-2">
              {t('skipped')}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
            <label className={cn(pickerClass, 'bg-ink text-surface')}>
              <Camera className="size-5" aria-hidden="true" />
              {prepared === null ? td('takePhoto') : t('changePhoto')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                data-testid="camera-input"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => choose(event.target.files?.[0])}
              />
            </label>
            <label className={cn(pickerClass, 'border border-rule-strong bg-surface text-ink')}>
              <FolderOpen className="size-5" aria-hidden="true" />
              {td('chooseFile')}
              <input
                type="file"
                accept={ACCEPT}
                data-testid="file-input"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => choose(event.target.files?.[0])}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              data-testid="capture-pages"
              className="min-[22rem]:col-span-2"
              onClick={() => {
                setCapturedPages(0);
                setCapturing(true);
              }}
            >
              <Files aria-hidden="true" />
              {td('multiPage')}
            </Button>
            <Button
              type="button"
              variant={choice === 'skip' ? 'outline' : 'quiet'}
              aria-pressed={choice === 'skip'}
              data-testid="skip-photo"
              className="min-[22rem]:col-span-2"
              onClick={() => {
                picking.current += 1;
                setPrepared(null);
                setProblem(null);
                setChoice('skip');
              }}
            >
              {t('skip')}
            </Button>
          </div>
          <p className="text-small text-ink-muted">{td('fileRule')}</p>
          {phase.step === 'preparing' && prepared === null ? <p className="text-small text-ink-muted">{td('preparing')}</p> : null}
          <FieldMessage id={`${fieldId}-file`} error={problem === null ? null : td(problem)} />
        </section>

        {choice === 'undecided' ? null : (
          <Group title={t('aboutTitle')}>
            <TextField
              label={tf('nickname')}
              hint={tf('nicknameHint')}
              testId="nickname"
              value={nickname}
              maxLength={120}
              error={nicknameMissing ? tf('nicknameRequired') : null}
              onChange={setNickname}
            />
            <FormSelect
              label={tf('kind')}
              testId="kind-select"
              value={kind}
              options={PROPERTY_KINDS.map((option) => ({ value: option, label: tp('kind', { kind: option }) }))}
              onChange={(next) => setKind(PROPERTY_KINDS.find((option) => option === next) ?? kind)}
            />
          </Group>
        )}
      </fieldset>

      {phase.step === 'uploading' ? <UploadProgress loaded={phase.loaded} total={phase.total} /> : null}
      {phase.step === 'starting' ? (
        <p role="status" className="text-body text-ink-2">
          {t('starting')}
        </p>
      ) : null}
      {errorText === null ? null : (
        <p role="alert" data-testid="wizard-error" className="text-body font-semibold break-words text-overdue">
          {errorText}
        </p>
      )}
      {phase.step === 'duplicate' ? (
        <DuplicateDialog
          title={phase.ticket.duplicates.map((duplicate) => duplicate.title).join(', ')}
          onCancel={() => setPhase({ step: 'editing' })}
          onContinue={() => {
            if (prepared !== null) void upload(phase.ticket, prepared);
          }}
        />
      ) : choice === 'undecided' ? null : (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" data-testid="wizard-start" disabled={!hydrated || busy}>
            {phase.step === 'failed' ? <RotateCw aria-hidden="true" /> : null}
            {phase.step === 'failed' ? td('retry') : t('continue')}
          </Button>
        </div>
      )}
    </form>
  );
}
