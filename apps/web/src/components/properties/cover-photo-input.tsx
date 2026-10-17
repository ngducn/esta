'use client';

import { ImagePlus, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { removeCoverPhoto, requestCoverPhotoUpload, setCoverPhoto } from '@/app/(app)/properties/actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusShape } from '@/components/status-mark';
import { Button } from '@/components/ui/button';
import { resizePhoto, type ResizeRefusal } from './resize-photo';

type Failure = ResizeRefusal | 'upload';

async function upload(propertyId: string, file: File): Promise<Failure | null> {
  const resized = await resizePhoto(file);
  if (!resized.ok) return resized.reason;
  const ticket = await requestCoverPhotoUpload(propertyId, resized.value.type);
  if (!ticket.ok) return 'upload';
  const sent = await fetch(ticket.url, { method: 'PUT', body: resized.value, headers: { 'content-type': resized.value.type, 'x-upsert': 'false' } });
  if (!sent.ok) return 'upload';
  const saved = await setCoverPhoto(propertyId, ticket.path);
  return saved.ok ? null : 'upload';
}

/**
 * The bytes go from the browser straight to a Storage signed upload URL (CLAUDE.md), never through a server function.
 * A failed upload leaves the current photo in place and keeps the file, so `Thử lại` sends it again.
 */
export function CoverPhotoInput({ propertyId, nickname, photoUrl }: { propertyId: string; nickname: string; photoUrl: string | null }) {
  const t = useTranslations('propertyForm');
  const router = useRouter();
  const inputId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ reason: Failure; file: File | null } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview !== null) URL.revokeObjectURL(preview);
  }, [preview]);

  const send = (file: File) =>
    startTransition(async () => {
      setFailure(null);
      const reason = await upload(propertyId, file).catch((): Failure => 'upload');
      if (reason !== null) {
        setFailure({ reason, file });
        return;
      }
      setPreview(URL.createObjectURL(file));
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      setFailure(null);
      const removed = await removeCoverPhoto(propertyId).catch(() => ({ ok: false as const }));
      if (!removed.ok) {
        setFailure({ reason: 'upload', file: null });
        return;
      }
      setPreview(null);
      router.refresh();
    });

  const shown = preview ?? photoUrl;
  const message =
    failure === null ? null : failure.reason === 'upload' || failure.reason === 'unreadable' ? t('photoFailed') : t(failure.reason === 'not_image' ? 'photoNotImage' : 'photoTooLarge');
  const retryFile = failure !== null && (failure.reason === 'upload' || failure.reason === 'unreadable') ? failure.file : null;

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="relative aspect-[16/10] w-full max-w-md overflow-hidden rounded-md border border-rule bg-surface-2">
        {shown === null ? (
          <div className="flex size-full items-center justify-center text-ink-muted">
            <ImagePlus className="size-12" strokeWidth={1.25} aria-hidden="true" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL or a local object URL, neither of which next/image can optimize
          <img data-testid="cover-photo-preview" src={shown} alt={t('photoAlt', { nickname })} className="size-full object-cover" />
        )}
      </div>
      <input
        ref={picker}
        id={inputId}
        data-testid="cover-photo-file"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) send(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => picker.current?.click()}>
          <ImagePlus aria-hidden="true" />
          {pending ? t('photoUploading') : shown === null ? t('photoPick') : t('photoReplace')}
        </Button>
        {photoUrl === null || pending ? null : (
          <ConfirmDialog
            title={t('photoRemoveConfirm', { nickname })}
            description={t('photoRemoveBody')}
            triggerLabel={t('photoRemove')}
            confirmLabel={t('photoRemove')}
            onConfirm={remove}
          />
        )}
      </div>
      <p role="status" aria-live="polite" className="flex min-h-7 flex-wrap items-center gap-2 text-body">
        {message === null ? null : (
          <>
            <StatusShape status="overdue" className="size-4" />
            <span data-testid="cover-photo-error" className="text-overdue">
              {message}
            </span>
            {retryFile === null ? null : (
              <Button type="button" variant="quiet" onClick={() => send(retryFile)}>
                <RotateCcw aria-hidden="true" />
                {t('photoRetry')}
              </Button>
            )}
          </>
        )}
      </p>
    </div>
  );
}
