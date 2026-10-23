'use client';

import { Download } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';

export type ReportDownload = { readonly href: string; readonly file: string; readonly label: string; readonly testId: string };

/**
 * `Tải Excel` and `Tải PDF`. Each fetches its file before saving it, so a phone that is offline gets the line saying so
 * beside the report it still shows, rather than a failed download it never sees.
 */
export function ReportDownloads({ downloads, failedLabel }: { downloads: readonly ReportDownload[]; failedLabel: string }) {
  const [failed, setFailed] = useState(false);
  async function save(event: MouseEvent<HTMLAnchorElement>, { href, file }: ReportDownload) {
    event.preventDefault();
    setFailed(false);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`The download answered ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      Object.assign(document.createElement('a'), { href: url, download: file }).click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {downloads.map((download) => (
          <a key={download.testId} href={download.href} download={download.file} data-testid={download.testId} onClick={(event) => void save(event, download)} className={buttonVariants({ variant: 'outline' })}>
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
