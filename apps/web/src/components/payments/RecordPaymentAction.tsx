'use client';

import { Banknote } from 'lucide-react';
import type { AbstractIntlMessages, Locale } from 'next-intl';
import { lazy, useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import type { PaymentTarget } from './RecordPaymentSheet';

/** The sheet's message subset, for a screen with no intl provider of its own. */
export type PaymentIntl = { readonly locale: Locale; readonly messages: AbstractIntlMessages };

const loadSheet = () => import('./RecordPaymentSheet');
const RecordPaymentSheet = lazy(loadSheet);
const loadIsland = () => import('./RecordPaymentIsland');
const RecordPaymentIsland = lazy(loadIsland);

const warming = new Set<() => Promise<unknown>>();

/**
 * Fetches the sheet's code on the first sign that someone is using the screen (a touch, a key, a scroll), so the first
 * `Ghi nhận` opens without a wait while the screen's own load carries none of it.
 */
function warmOnFirstIntent(load: () => Promise<unknown>) {
  if (warming.has(load)) return;
  warming.add(load);
  const warm = () => void load();
  for (const type of ['pointerdown', 'keydown', 'scroll'] as const) window.addEventListener(type, warm, { once: true, passive: true });
}

/**
 * `Ghi nhận` on a collections row or a Home item. Each opening mounts a fresh sheet, with its own idempotency key and
 * the row's prefill. Given `intl`, the sheet brings its own intl provider (`RecordPaymentIsland`).
 */
export function RecordPaymentAction({ label, target, intl, describedBy }: { label: string; target: PaymentTarget; intl?: PaymentIntl; describedBy?: string }) {
  const load = intl === undefined ? loadSheet : loadIsland;
  const dialog = useDeferredDialog(load);
  useEffect(() => warmOnFirstIntent(load), [load]);
  return (
    <>
      <button type="button" data-testid="row-action-record-payment" aria-describedby={describedBy} {...dialog.triggerProps} className={buttonVariants({ variant: 'outline' })}>
        <Banknote aria-hidden="true" />
        {label}
      </button>
      {intl === undefined ? (
        <DeferredPopup dialog={dialog} popup={RecordPaymentSheet} props={{ target }} />
      ) : (
        <DeferredPopup dialog={dialog} popup={RecordPaymentIsland} props={{ target, intl }} />
      )}
    </>
  );
}
