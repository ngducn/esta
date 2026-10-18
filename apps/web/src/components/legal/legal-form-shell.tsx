'use client';

import type { NewParty } from '@esta/core/schemas/party';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { saveLegalItem } from '@/app/(app)/properties/[id]/legal/actions';
import { useFocusAnchor } from '@/components/completeness/use-focus-anchor';
import { StatusShape } from '@/components/status-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import { useHydrated } from '@/lib/use-hydrated';
import type { LegalKind } from '@/server/properties/legal';

const ERROR_MESSAGES = {
  invalid: 'errorInvalid',
  network: 'errorNetwork',
  national_id: 'errorNationalId',
  party_national_id: 'errorPartyNationalId',
} as const;

export type LegalSubmit = () => Record<string, unknown> | null;

/** The fields a refused save named for holding a full ID, such as `origin_text` or `annotations.1` (D11). */
export type HeldFields = readonly string[];

/**
 * Submits through `saveLegalItem`, which parses the input again with the kind's schema, and returns to the tab.
 * Controlled fields would drop what is typed before React hydrates, so nothing takes input until then.
 */
export function LegalFormShell({
  propertyId,
  kind,
  itemId,
  read,
  newParties,
  onHeld,
  children,
}: {
  propertyId: string;
  kind: LegalKind;
  itemId: string | null;
  read: LegalSubmit;
  /** The quick-added parties the read input names, created in the same request as the save. */
  newParties?: () => readonly NewParty[];
  /** Told the fields to mark on each save: those holding a full ID, or none. */
  onHeld: (fields: HeldFields) => void;
  children: ReactNode;
}) {
  const t = useTranslations('propertyLegal');
  const router = useRouter();
  const hydrated = useHydrated();
  useFocusAnchor(hydrated);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<'invalid' | 'network' | 'national_id' | 'party_national_id' | null>(null);
  const tabHref = `/properties/${propertyId}/legal`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = read();
    if (input === null) {
      setError('invalid');
      return;
    }
    setError(null);
    onHeld([]);
    startTransition(async () => {
      const result = await saveLegalItem(propertyId, kind, itemId, input, newParties?.() ?? []).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (result.ok) {
        router.push(tabHref);
        return;
      }
      if (result.reason !== 'national_id') {
        setError(result.reason === 'invalid' ? 'invalid' : 'network');
        return;
      }
      onHeld(result.fields);
      setError(result.fields.includes('parties') ? 'party_national_id' : 'national_id');
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-5" data-testid={`${kind}-form`}>
      <fieldset disabled={!hydrated} className="flex min-w-0 flex-col gap-5">
        {hydrated ? null : (
          <p role="status" data-testid="form-loading" className="text-body text-ink-muted">
            {t('formLoading')}
          </p>
        )}
        {children}
        <div className="flex flex-col gap-3">
          {error === null ? null : (
            <p role="alert" data-testid="form-error" className="flex items-start gap-2 text-body text-overdue">
              <StatusShape status="overdue" className="mt-1 size-4" />
              <span className="wrap-anywhere">{t(ERROR_MESSAGES[error])}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending} data-testid="save-legal-item">
              {pending ? t('saving') : t('save')}
            </Button>
            <Link href={tabHref} className={buttonVariants({ variant: 'outline' })}>
              {t('cancel')}
            </Link>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
