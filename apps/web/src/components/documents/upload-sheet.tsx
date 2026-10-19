'use client';

import type { IsoDate } from '@esta/core/date';
import { acceptsMime, DOCUMENT_CATEGORY_IDS, defaultDocumentTitle, isDocumentCategory, type DocumentCategory } from '@esta/core/documents';
import { Camera, Files, FolderOpen, RotateCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DateInput } from '@/components/date-input';
import { FieldMessage } from '@/components/field-message';
import { TextField } from '@/components/form-parts';
import { FormSelect } from '@/components/properties/address-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ACCEPT } from '@/lib/upload/prepare';
import { useObjectUrl } from '@/lib/use-object-url';
import { registerDocument } from '@/server/documents/actions';
import { DuplicateDialog } from './duplicate-dialog';
import { LeaveConfirm, MultiPageCapture } from './multi-page-capture';
import { UploadProgress } from './upload-progress';
import { useDocumentUpload } from './use-document-upload';

/** Five fields, so a sheet rather than a page (DESIGN-BRIEF §5.3). */
export default function UploadSheet({
  propertyId,
  nickname,
  initialFile,
  leaseId = null,
  initialCategory = 'certificate',
  onClose,
  onSaved,
}: {
  propertyId: string;
  nickname: string;
  initialFile: File | null;
  /** A lease's contract or handover papers: the document is filed under that lease (P3-08). */
  leaseId?: string | null;
  initialCategory?: DocumentCategory;
  onClose: () => void;
  onSaved: (saved: { documentId: string; title: string }) => void;
}) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const fieldId = useId();
  const [category, setCategory] = useState<DocumentCategory>(initialCategory);
  const prefix = (next: DocumentCategory) => defaultDocumentTitle(t('titlePrefix', { category: next }), nickname);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const title = titleOverride ?? prefix(category);
  const [expiresOn, setExpiresOn] = useState<IsoDate | null>(null);
  const [titleMissing, setTitleMissing] = useState(false);
  const [fileMissing, setFileMissing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedPages, setCapturedPages] = useState(0);
  const [leaving, setLeaving] = useState<'back' | 'close' | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const { upload, pick, capture, send, proceed, dismiss } = useDocumentUpload({
    initialFile,
    finish: async (ticket, { file, sha256, previews }) => {
      const registered = await registerDocument({
        documentId: ticket.documentId,
        propertyId,
        category,
        title,
        expiresOn,
        filename: file.name,
        mime: file.type,
        size: file.size,
        sha256,
        pageCount: previews.pageCount,
        leaseId,
      });
      if (registered.ok) onSaved({ documentId: ticket.documentId, title: registered.title });
      return registered.ok;
    },
  });
  const prepared = 'prepared' in upload ? upload.prepared : null;
  const preview = useObjectUrl(prepared === null ? null : prepared.previews.thumb);
  const problem =
    upload.step === 'refused'
      ? upload.problem
      : prepared !== null && !acceptsMime(category, prepared.file.type)
        ? 'wrongType'
        : prepared === null && fileMissing
          ? 'fileRequired'
          : null;

  // The capture view and the form differ in length, so each opens at its top rather than at the other's scroll.
  useEffect(() => {
    sheet.current?.scrollTo({ top: 0 });
  }, [capturing]);

  const unsaved = capturing ? capturedPages : prepared?.captured === true ? prepared.previews.pageCount : 0;
  const leave = (target: 'back' | 'close', confirmed = false) => {
    if (unsaved > 0 && !confirmed) {
      setLeaving(target);
      return;
    }
    setLeaving(null);
    if (target === 'close') onClose();
    else setCapturing(false);
  };

  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    setFileMissing(false);
    pick(file);
  };

  const changeCategory = (next: string) => {
    if (isDocumentCategory(next)) setCategory(next);
  };

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    const missingTitle = title.trim() === '';
    setTitleMissing(missingTitle);
    setFileMissing(prepared === null);
    if (prepared === null || missingTitle || problem !== null) return;
    send({ propertyId, category });
  };

  const busy = upload.step === 'preparing' || upload.step === 'signing' || upload.step === 'uploading';
  const megabytes = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <Sheet open onOpenChange={(open) => (open || busy ? undefined : leave('close'))}>
      <SheetContent ref={sheet} data-testid="upload-sheet">
        <div className="flex flex-col gap-1">
          <SheetTitle>{capturing ? t('captureTitle') : t('sheetTitle')}</SheetTitle>
          <SheetDescription>{capturing ? t('captureBody') : t('sheetBody')}</SheetDescription>
        </div>
        {capturing ? (
          <>
            <MultiPageCapture
              confirming={leaving !== null}
              onCount={setCapturedPages}
              onBack={() => leave('back')}
              onCombined={(combined) => {
                setCapturing(false);
                setFileMissing(false);
                capture(combined);
              }}
            />
            {leaving === null ? null : <LeaveConfirm count={unsaved} onKeep={() => setLeaving(null)} onDiscard={() => leave(leaving, true)} />}
          </>
        ) : null}
        <form noValidate hidden={capturing} onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
              <label className="relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm bg-ink px-4 text-body font-semibold text-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                <Camera className="size-5" aria-hidden="true" />
                {t('takePhoto')}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  data-testid="camera-input"
                  disabled={busy}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => choose(event.target.files?.[0])}
                />
              </label>
              <label className="relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm border border-rule-strong bg-surface px-4 text-body font-semibold text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                <FolderOpen className="size-5" aria-hidden="true" />
                {t('chooseFile')}
                <input
                  type="file"
                  accept={ACCEPT}
                  data-testid="file-input"
                  disabled={busy}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => choose(event.target.files?.[0])}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                data-testid="capture-pages"
                disabled={busy}
                className="min-[22rem]:col-span-2"
                onClick={() => {
                  setCapturedPages(0);
                  setCapturing(true);
                }}
              >
                <Files aria-hidden="true" />
                {t('multiPage')}
              </Button>
            </div>
            <p className="text-small text-ink-muted">{t('fileRule')}</p>
            {prepared === null ? null : (
              <div className="flex items-center gap-3 rounded-md border border-rule bg-surface-2 p-3">
                {preview === null ? null : (
                  // eslint-disable-next-line @next/next/no-img-element -- a local blob URL of the thumbnail made in this tab
                  <img src={preview} alt={t('previewAlt')} data-testid="upload-preview" className="size-16 shrink-0 rounded-sm object-cover" />
                )}
                <p className="min-w-0 text-small break-words text-ink-2">
                  {t('chosenFile', { name: prepared.file.name, size: megabytes.format(prepared.file.size / 1024 / 1024) })}
                  {prepared.previews.pageCount > 1 ? ` · ${t('pageCount', { count: prepared.previews.pageCount })}` : null}
                </p>
              </div>
            )}
            {upload.step === 'preparing' ? <p className="text-small text-ink-muted">{t('preparing')}</p> : null}
            <FieldMessage id={`${fieldId}-file`} error={problem === null ? null : t(problem)} />
          </div>
          <FormSelect
            label={t('categoryField')}
            testId="document-category"
            value={category}
            options={DOCUMENT_CATEGORY_IDS.map((id) => ({ value: id, label: t('category', { category: id }) }))}
            onChange={changeCategory}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${fieldId}-property`} className="text-body font-semibold text-ink">
              {t('propertyField')}
            </label>
            <Input id={`${fieldId}-property`} data-testid="document-property" value={nickname} readOnly className="mt-1 bg-surface-2" />
          </div>
          <TextField
            label={t('titleField')}
            inputId={`${fieldId}-title`}
            testId="document-title"
            value={title}
            maxLength={200}
            error={titleMissing ? t('titleRequired') : null}
            onChange={setTitleOverride}
          />
          <DateInput label={t('expiresField')} onValueChange={setExpiresOn} />
          {upload.step === 'uploading' ? <UploadProgress loaded={upload.loaded} total={upload.total} /> : null}
          {upload.step === 'failed' ? (
            <p role="alert" data-testid="upload-error" className="text-body font-semibold text-overdue">
              {t('networkError')}
            </p>
          ) : null}
          {leaving !== null && !capturing ? (
            <LeaveConfirm count={unsaved} onKeep={() => setLeaving(null)} onDiscard={() => leave(leaving, true)} />
          ) : upload.step === 'duplicate' ? (
            <DuplicateDialog title={upload.duplicates.map((duplicate) => duplicate.title).join(', ')} onCancel={dismiss} onContinue={proceed} />
          ) : (
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <SheetClose render={<Button type="button" variant="outline" disabled={busy} />}>{t('cancel')}</SheetClose>
              <Button type="submit" data-testid="save-document" disabled={busy}>
                {upload.step === 'failed' ? <RotateCw aria-hidden="true" /> : null}
                {upload.step === 'failed' ? t('retry') : t('save')}
              </Button>
            </div>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
