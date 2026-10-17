'use client';

import { parseMapsUrl, type GeoPoint } from '@esta/core/maps';
import { Check, ClipboardPaste, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { FieldMessage } from '@/components/field-message';
import { buttonVariants } from '@/components/ui/button-variants';
import { Input } from '@/components/ui/input';
import { resolveMapsLink, type MapsLinkFailure, type MapsLinkResult } from '@/server/maps/actions';

/** Every refusal, from the browser parser or the server resolver, lands on one of a few messages that say what to paste instead. */
const FAILURE_MESSAGE = {
  not_maps: 'notMaps',
  host_not_allowed: 'notMaps',
  not_https: 'notMaps',
  not_a_url: 'unreadable',
  no_coordinates: 'unreadable',
  too_long: 'unreadable',
  out_of_range: 'unreadable',
  redirect_not_allowed: 'shortLink',
  no_redirect: 'shortLink',
  too_many_redirects: 'shortLink',
  private_address: 'shortLink',
  timeout: 'network',
  unreachable: 'network',
  signed_out: 'signedOut',
} as const satisfies Record<MapsLinkFailure, string>;

export type LinkPreview = { readonly point: GeoPoint; readonly outsideVietnam: boolean };

/** A long link is read in the browser; only a short link goes to the server, which follows it behind the PRP-5 guards. */
async function readLink(text: string): Promise<MapsLinkResult> {
  const parsed = parseMapsUrl(text);
  if (parsed.kind === 'short_link') return resolveMapsLink(text);
  if (parsed.kind === 'invalid') return { ok: false, reason: parsed.reason };
  return { ok: true, lat: parsed.point.lat, lng: parsed.point.lng, outsideVietnam: parsed.outsideVietnam };
}

const formatPoint = ({ lat, lng }: GeoPoint) => `${Number(lat.toFixed(6))}, ${Number(lng.toFixed(6))}`;

export function PasteMapsLink({
  preview,
  saving,
  onPreview,
  onSave,
}: {
  preview: LinkPreview | null;
  saving: boolean;
  onPreview: (preview: LinkPreview | null) => void;
  onSave: (point: GeoPoint) => void;
}) {
  const t = useTranslations('map');
  const id = useId();
  const [text, setText] = useState('');
  const [failure, setFailure] = useState<MapsLinkFailure | null>(null);
  const [reading, startReading] = useTransition();

  const read = (value: string) => {
    if (value.trim() === '') return;
    startReading(async () => {
      const result = await readLink(value);
      setFailure(result.ok ? null : result.reason);
      onPreview(result.ok ? { point: { lat: result.lat, lng: result.lng }, outsideVietnam: result.outsideVietnam } : null);
    });
  };

  const message = failure === null ? null : t('linkError', { reason: FAILURE_MESSAGE[failure] });

  return (
    <div className="flex flex-col gap-3">
      <form
        aria-labelledby={`${id}-title`}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          read(text);
        }}
      >
        <div className="flex flex-col gap-1">
          <h3 id={`${id}-title`} className="text-body font-semibold text-ink">
            {t('pasteTitle')}
          </h3>
          <p id={`${id}-help`} className="text-small text-ink-muted">
            {t('pasteHelp')}
          </p>
        </div>
        <label className="sr-only" htmlFor={`${id}-input`}>
          {t('pasteLabel')}
        </label>
        <Input
          id={`${id}-input`}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-describedby={`${id}-help ${id}-message`}
          aria-invalid={failure !== null}
          onChange={(event) => {
            setText(event.target.value);
            setFailure(null);
          }}
          onPaste={(event) => read(event.clipboardData.getData('text'))}
        />
        <button type="submit" disabled={reading} className={buttonVariants({ variant: 'outline' })}>
          <ClipboardPaste aria-hidden="true" />
          {reading ? t('reading') : t('preview')}
        </button>
      </form>

      <FieldMessage id={`${id}-message`} error={message}>
        {preview === null ? null : (
          <span data-testid="link-preview" className="flex flex-col gap-3">
            <span className="figures text-ink">{t('previewPoint', { point: formatPoint(preview.point) })}</span>
            {preview.outsideVietnam ? (
              <span role="alert" className="flex items-start gap-2 rounded-md border border-due bg-due-fill p-3 text-due">
                <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                {t('outsideVietnam')}
              </span>
            ) : null}
          </span>
        )}
      </FieldMessage>

      {preview === null ? null : (
        <button
          key={formatPoint(preview.point)}
          ref={(button) => button?.scrollIntoView({ block: 'nearest' })}
          type="button"
          disabled={saving}
          onClick={() => {
            onSave(preview.point);
            setText('');
          }}
          className={buttonVariants({ variant: preview.outsideVietnam ? 'outline' : 'primary', className: 'scroll-mb-24 lg:scroll-mb-6' })}
        >
          <Check aria-hidden="true" />
          {preview.outsideVietnam ? t('saveAnyway') : t('useThisLocation')}
        </button>
      )}
    </div>
  );
}
