'use client';

import { FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { LeaseDocument } from '@/server/leases/detail';

const UploadSheet = lazy(() => import('@/components/documents/upload-sheet'));

/**
 * The papers filed under this lease, shown plainly (Ryan's 2026-10-19 ruling: no blur, no gate). With none, the one
 * action is to upload the contract, filed under this lease as a lease contract. It stays an outline button, because the
 * accent marks the page's one primary action (DESIGN.md One Accent Rule).
 */
export function LeaseDocuments({
  leaseId,
  propertyId,
  nickname,
  documents,
  canEdit,
}: {
  leaseId: string;
  propertyId: string;
  nickname: string;
  documents: readonly LeaseDocument[];
  canEdit: boolean;
}) {
  const t = useTranslations('leases');
  const category = useTranslations('documents');
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const upload = canEdit ? (
    <Button type="button" variant="outline" data-testid="lease-upload" onClick={() => setUploading(true)}>
      <Upload aria-hidden="true" />
      {t('uploadContract')}
    </Button>
  ) : null;
  return (
    <section aria-labelledby="lease-documents" data-testid="lease-documents" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h2 id="lease-documents" className="text-lead font-bold text-ink">
        {t('documentsTitle')}
      </h2>
      {documents.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-3 text-body font-semibold text-ink">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent">
              <FileText className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            {t('documentsEmpty')}
          </p>
          <p className="max-w-prose text-body text-pretty text-ink-2">{canEdit ? t('documentsEmptyBody') : t('documentsViewerEmpty')}</p>
          {upload}
        </div>
      ) : (
        <>
          <ul className="flex flex-col">
            {documents.map((document) => (
              <li key={document.id} data-testid="lease-document" className="border-b border-rule last:border-b-0">
                <Link href={`/documents/${document.id}`} className="flex min-h-touch items-center gap-3 py-2 text-body text-ink hover:text-accent">
                  <FileText className="size-5 shrink-0 text-ink-muted" strokeWidth={1.8} aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold break-words">{document.title}</span>
                    <span className="text-small text-ink-muted">{category('category', { category: document.category })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {upload}
        </>
      )}
      {uploading ? (
        <Suspense fallback={null}>
          <UploadSheet
            propertyId={propertyId}
            nickname={nickname}
            initialFile={null}
            leaseId={leaseId}
            initialCategory="lease_contract"
            onClose={() => setUploading(false)}
            onSaved={() => {
              setUploading(false);
              router.refresh();
            }}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
