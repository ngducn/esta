'use client';

import { Camera, FileText, FolderOpen, RotateCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useDocumentUpload, type Upload } from '@/components/documents/use-document-upload';
import { FieldMessage } from '@/components/field-message';
import { StatusShape } from '@/components/status-shape';
import { buttonVariants } from '@/components/ui/button-variants';
import { ACCEPT } from '@/lib/upload/prepare';
import { useObjectUrl } from '@/lib/use-object-url';
import { cn } from '@/lib/utils';

function previewOf(upload: Upload): Blob | null {
  if ('prepared' in upload) return upload.prepared.previews.review;
  if ((upload.step === 'preparing' || upload.step === 'refused') && upload.file?.type.startsWith('image/') === true) return upload.file;
  return null;
}

/**
 * The expense's receipt: the one already filed, or a photo sent the moment it is chosen, so Mẹ types the amount while
 * it travels. Saving the expense registers the photo as its document, so a photo dropped or never saved stays out of
 * Tài liệu.
 */
export function useReceipt({ propertyId, filed, initialFile }: { propertyId: string; filed: string | null; initialFile: File | null }) {
  const [kept, setKept] = useState(filed);
  const target = { propertyId, category: 'invoice_receipt' } as const;
  const { upload, pick, clear, send, settled } = useDocumentUpload({ initialFile, eager: target });
  const preview = useObjectUrl(previewOf(upload));
  return {
    kept,
    upload,
    preview,
    pick: (file: File) => {
      setKept(null);
      pick(file);
    },
    retry: () => send(target),
    drop: () => {
      setKept(null);
      clear();
    },
    /** What saving links: nothing, the receipt already filed, the photo now in Storage, or false while the photo is not there. */
    linked: async (title: string) => {
      if (kept !== null) return { kind: 'existing', documentId: kept } as const;
      const state = await settled();
      if (state.step === 'empty') return null;
      if (state.step !== 'sent') return false;
      const { file, sha256, previews } = state.prepared;
      return { kind: 'new', documentId: state.documentId, filename: file.name, mime: file.type, size: file.size, sha256, pageCount: previews.pageCount, title } as const;
    },
  };
}

export type Receipt = ReturnType<typeof useReceipt>;

const pickerClass =
  'relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm border border-rule-strong bg-surface px-4 text-body font-medium text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

export function ReceiptField({ receipt, disabled, onPick }: { receipt: Receipt; disabled: boolean; onPick: () => void }) {
  const t = useTranslations('expenses');
  const fieldId = useId();
  const { kept, upload } = receipt;
  const percent = upload.step === 'uploading' && upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0;
  const choose = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    onPick();
    receipt.pick(file);
  };

  return (
    <section aria-labelledby={`${fieldId}-title`} className="flex flex-col gap-3" data-testid="expense-receipt">
      <h3 id={`${fieldId}-title`} className="text-body font-medium text-ink">
        {t('receiptTitle')} <span className="font-normal text-ink-muted">({t('optional')})</span>
      </h3>
      {kept === null ? null : (
        <Link href={`/documents/${kept}`} data-testid="expense-saved-receipt" className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
          <FileText aria-hidden="true" />
          {t('receiptSaved')}
        </Link>
      )}
      {upload.step === 'preparing' || upload.step === 'ready' || upload.step === 'signing' ? <p className="text-small text-ink-muted">{t('receiptPreparing')}</p> : null}
      {upload.step === 'uploading' ? (
        <div className="flex flex-col gap-1" data-testid="receipt-uploading">
          <p className="text-small text-ink-2">{t('receiptUploading')}</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('receiptUploading')} className="h-1.5 overflow-hidden rounded-full bg-rule">
            <div className="h-full rounded-full bg-ink transition-[width] duration-(--duration-fast) ease-standard" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}
      {upload.step === 'sent' ? (
        <p data-testid="receipt-uploaded" className="flex items-center gap-2 text-small text-ink-2">
          <StatusShape status="paid" className="size-4" />
          {t('receiptUploaded')}
        </p>
      ) : null}
      {upload.step === 'refused' || upload.step === 'failed' ? (
        <div className="flex flex-col items-start gap-2">
          <FieldMessage id={`${fieldId}-error`} error={t(upload.step === 'refused' ? upload.problem : 'receiptFailed')} />
          {upload.step === 'failed' ? (
            <button type="button" data-testid="receipt-retry" onClick={receipt.retry} className={buttonVariants({ variant: 'outline' })}>
              <RotateCw aria-hidden="true" />
              {t('receiptRetry')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 min-[22rem]:grid-cols-2">
        <label className={pickerClass}>
          <Camera className="size-5" aria-hidden="true" />
          {t('takePhoto')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="sheet-receipt-camera"
            disabled={disabled}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => choose(event.target)}
          />
        </label>
        <label className={pickerClass}>
          <FolderOpen className="size-5" aria-hidden="true" />
          {t('chooseFile')}
          <input
            type="file"
            accept={ACCEPT}
            data-testid="sheet-receipt-file"
            disabled={disabled}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => choose(event.target)}
          />
        </label>
      </div>
      {kept === null && upload.step === 'empty' ? null : (
        <button type="button" data-testid="receipt-remove" onClick={receipt.drop} disabled={disabled} className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
          <X aria-hidden="true" />
          {t('receiptRemove')}
        </button>
      )}
    </section>
  );
}
