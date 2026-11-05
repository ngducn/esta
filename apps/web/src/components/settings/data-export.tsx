'use client';

import type { Result } from '@esta/core/result';
import { Download, FileArchive } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { FormAlert } from '@/components/form-alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAction } from '@/components/use-action';
import { cn } from '@/lib/utils';

const exportSchema = z.object({ parts: z.array(z.object({ name: z.string(), url: z.url() })).min(1) });
type Parts = z.output<typeof exportSchema>['parts'];

export type DataExportLabels = {
  readonly start: string;
  readonly preparing: string;
  readonly ready: string;
  /** Holds `{part}` and `{total}` for the client to fill, since the part count comes with the answer. */
  readonly readyPart: string;
  readonly manyParts: string;
  readonly failed: string;
};

type Stage = { readonly kind: 'idle' } | { readonly kind: 'ready'; readonly parts: Parts } | { readonly kind: 'failed' };
async function requestExport(endpoint: string): Promise<Result<Parts>> {
  const response = await fetch(endpoint, { method: 'POST' });
  if (!response.ok) return { ok: false, reason: 'refused' };
  const parsed = exportSchema.safeParse(await response.json());
  return parsed.success ? { ok: true, value: parsed.data.parts } : { ok: false, reason: 'unreadable' };
}

const fill = (template: string, values: Readonly<Record<string, number>>) => template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));

export function DataExport({ labels, endpoint = '/api/export' }: { labels: DataExportLabels; endpoint?: string }) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const { pending, run } = useAction();
  const start = () => run(() => requestExport(endpoint), (answer) => setStage(answer.ok ? { kind: 'ready', parts: answer.value } : { kind: 'failed' }));

  return (
    <div className="flex flex-col items-start gap-3">
      <Button type="button" data-testid="export-start" disabled={pending} onClick={start}>
        <FileArchive aria-hidden="true" />
        {labels.start}
      </Button>
      <p role="status" data-testid="export-status" className="text-body-sm text-text-muted empty:hidden">
        {pending ? labels.preparing : null}
      </p>
      {stage.kind === 'ready' && !pending ? (
        <div className="flex flex-col items-start gap-2">
          {stage.parts.length > 1 ? <p className="text-body-sm text-text-muted">{fill(labels.manyParts, { total: stage.parts.length })}</p> : null}
          <ul className="flex flex-col items-start gap-2">
            {stage.parts.map((part, index) => (
              <li key={part.name}>
                <a href={part.url} download data-testid="export-link" className={cn(buttonVariants({ variant: 'secondary' }), 'h-auto')}>
                  <Download aria-hidden="true" />
                  {stage.parts.length > 1 ? fill(labels.readyPart, { part: index + 1, total: stage.parts.length }) : labels.ready}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <FormAlert message={stage.kind === 'failed' && !pending ? labels.failed : null} data-testid="export-failed" />
    </div>
  );
}
