'use client';

import { Download } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { saveBlob } from '@/lib/save-blob';

export type ReportDownload = { readonly href: string; readonly file: string; readonly label: string; readonly testId: string };

export function ReportDownloads({ downloads, failedLabel }: { downloads: readonly ReportDownload[]; failedLabel: string }) {
  const [failed, setFailed] = useState(false);
  async function fetchThenSave(event: MouseEvent<HTMLAnchorElement>, { href, file }: ReportDownload) {
    event.preventDefault();
    setFailed(false);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`The download answered ${response.status}`);
      saveBlob(await response.blob(), file);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {downloads.map((download) => (
          <a key={download.testId} href={download.href} download={download.file} data-testid={download.testId} onClick={(event) => void fetchThenSave(event, download)} className={buttonVariants({ variant: 'outline' })}>
            <Download aria-hidden="true" />
            {download.label}
          </a>
        ))}
      </div>
      {failed ? (
        <p role="alert" data-testid="report-download-failed" className="text-small text-overdue">
          {failedLabel}
        </p>
      ) : null}
    </div>
  );
}
